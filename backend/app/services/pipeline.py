"""Pipeline orchestration with real audio processing."""

from __future__ import annotations

import asyncio
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

import numpy as np
import soundfile as sf

from app.api import schemas
from app.config import settings
from app.services.search.download_service import DownloadService
from app.services.library import LibraryPaths
from app.services.db import db

StageStatus = str  # alias for readability

_STAGE_TEMPLATE: List[Tuple[str, str]] = [
    ("ingest", "Ingest"),
    ("analysis", "Analysis"),
    ("separation", "Separation"),
    ("loop", "Loop Slicing"),
    ("project", "Project Assembly"),
]


@dataclass
class StageState:
    id: str
    label: str
    status: StageStatus = "pending"
    progress: float = 0.0
    detail: Optional[str] = None
    eta_seconds: Optional[int] = None

    def to_schema(self) -> schemas.StageProgress:
        return schemas.StageProgress(
            id=self.id,
            label=self.label,
            status=self.status,  # type: ignore[arg-type]
            progress=self.progress,
            detail=self.detail,
            eta_seconds=self.eta_seconds,
        )


@dataclass
class JobRecord:
    job_id: UUID
    track_id: UUID
    status: StageStatus = "queued"
    current_stage: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    detail: Optional[str] = None
    stages: Dict[str, StageState] = field(default_factory=dict)
    task: Optional[asyncio.Task[None]] = None

    def progress(self) -> float:
        total = len(self.stages)
        completed = sum(1 for stage in self.stages.values() if stage.status == "done")
        running = next(
            (stage for stage in self.stages.values() if stage.status == "running"), None
        )
        base = completed / total
        if running:
            return min(1.0, base + running.progress / total)
        return base


@dataclass
class LoopRecord:
    id: str
    label: str
    path: Path
    start_bar: int
    bar_count: int
    stem: str
    bpm: float
    musical_key: Optional[str]
    energy: Optional[float] = None

    def to_preview(self, track_id: UUID) -> schemas.LoopPreview:
        return schemas.LoopPreview(
            id=self.id,
            label=self.label,
            start_bar=self.start_bar,
            bar_count=self.bar_count,
            stem=self.stem,
            bpm=self.bpm,
            musical_key=self.musical_key,
            energy=self.energy,
            file_url=f"/api/v1/library/tracks/{track_id}/loops/{self.id}/audio",
        )


@dataclass
class TrackRecord:
    track_id: UUID
    slug: str
    title: str
    artist: Optional[str]
    status: str
    created_at: datetime
    bpm: Optional[float] = None
    musical_key: Optional[str] = None
    original_path: Optional[Path] = None
    stems_dir: Optional[Path] = None
    loops_dir: Optional[Path] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    stems: List[str] = field(default_factory=list)
    loops: List[str] = field(default_factory=list)

    def to_summary(self) -> schemas.TrackSummary:
        return schemas.TrackSummary(
            track_id=self.track_id,
            title=self.title,
            artist=self.artist,
            status=self.status,
            bpm=self.bpm,
            musical_key=self.musical_key,
            created_at=self.created_at,
        )

    def to_detail(self) -> schemas.TrackDetailResponse:
        return schemas.TrackDetailResponse(
            track_id=self.track_id,
            title=self.title,
            artist=self.artist,
            status=self.status,
            bpm=self.bpm,
            musical_key=self.musical_key,
            created_at=self.created_at,
            metadata=self.metadata,
            stems=self.stems,
            loops=self.loops,
            provenance={"slug": self.slug},
        )


class PipelineOrchestrator:
    """Coordinates ingest + loop generation pipeline."""

    def __init__(self) -> None:
        self._jobs: Dict[UUID, JobRecord] = {}
        self._tracks: Dict[UUID, TrackRecord] = {}
        self._loop_records: Dict[UUID, Dict[str, LoopRecord]] = {}

        # Hydrate from DB on boot
        raw_tracks = db.load_all_tracks()
        for tid, data in raw_tracks.items():
            self._tracks[tid] = TrackRecord(**data)

        raw_loops = db.load_all_loops()
        for tid, loops_map in raw_loops.items():
            self._loop_records[tid] = {
                lid: LoopRecord(**ldata) for lid, ldata in loops_map.items()
            }

        self._lock = asyncio.Lock()
        self._library = LibraryPaths(settings)
        self._downloader = DownloadService(settings)
        self._fallback_root = settings.MUSIC_LIBRARY / ".library"
        self._fallback_root.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Job management
    # ------------------------------------------------------------------
    def queue_ingest(self, payload: schemas.IngestRequest) -> schemas.IngestResponse:
        job_id = uuid4()
        track_id = uuid4()
        title = self._derive_title(payload.source)
        slug = self._library.slugify(title or str(track_id))
        track_record = TrackRecord(
            track_id=track_id,
            slug=slug,
            title=title,
            artist=None,
            status="queued",
            created_at=datetime.now(timezone.utc),
            metadata={
                "tags": payload.tags,
                "collection": payload.collection,
                "source": str(payload.source),
            },
        )
        self._tracks[track_id] = track_record
        db.save_track(track_record)

        job_record = JobRecord(job_id=job_id, track_id=track_id)

        # Determine which stages to run
        options = payload.options
        stages_to_add = [("ingest", "Ingest")]
        if options.analysis:
            stages_to_add.append(("analysis", "Analysis"))
        if options.separation:
            stages_to_add.append(("separation", "Separation"))
        if options.loop_slicing:
            stages_to_add.append(("loop", "Loop Slicing"))
        stages_to_add.append(("project", "Project Assembly"))

        job_record.stages = {
            stage_id: StageState(stage_id, label) for stage_id, label in stages_to_add
        }
        self._jobs[job_id] = job_record

        loop = asyncio.get_running_loop()
        job_record.task = loop.create_task(self._run_pipeline(job_record, payload))

        return schemas.IngestResponse(job_id=job_id, track_id=track_id, stage="queued")

    def queue_processing(
        self, payload: schemas.ProcessJobRequest
    ) -> schemas.JobResponse:
        track_id = payload.track_id
        if track_id not in self._tracks:
            raise KeyError(f"Track {track_id} not registered")

        job_id = uuid4()
        job_record = JobRecord(job_id=job_id, track_id=track_id)
        job_record.stages = {
            stage_id: StageState(stage_id, label) for stage_id, label in _STAGE_TEMPLATE
        }
        self._jobs[job_id] = job_record

        loop = asyncio.get_running_loop()
        job_record.task = loop.create_task(self._run_pipeline(job_record))

        return self.get_job(job_id)

    def get_job(self, job_id: UUID) -> schemas.JobResponse:
        job = self._jobs.get(job_id)
        if job is None:
            raise KeyError(f"Job {job_id} not found")
        return schemas.JobResponse(
            job_id=job.job_id,
            track_id=job.track_id,
            status=job.status,  # type: ignore[arg-type]
            current_stage=job.current_stage,
            progress=round(job.progress(), 3),
            detail=job.detail,
            started_at=job.started_at,
            completed_at=job.completed_at,
            stages=[stage.to_schema() for stage in job.stages.values()],
        )

    def delete_track(self, track_id: UUID) -> None:
        if track_id not in self._tracks:
            raise KeyError(f"Track {track_id} not found")
        # delete track folder and clear it from memory
        try:
            track_dir = self._library.get_track_dir(track_id)
            if track_dir.exists():
                import shutil

                shutil.rmtree(track_dir)
        except Exception as e:
            logger.error(f"Failed to delete track directory for {track_id}: {e}")
        del self._tracks[track_id]
        db.delete_track(track_id)
        if track_id in self._loop_records:
            del self._loop_records[track_id]

    async def _run_pipeline(
        self, job: JobRecord, payload: schemas.IngestRequest | None = None
    ) -> None:
        job.started_at = datetime.now(timezone.utc)
        job.status = "running"
        track = self._tracks[job.track_id]

        # Default options if not provided (e.g. reprocessing)
        options = payload.options if payload else schemas.ProcessingOptions()

        try:
            audio_path = await self._run_stage(
                job, "ingest", self._stage_ingest, track, payload
            )

            if options.analysis:
                await self._run_stage(
                    job, "analysis", self._stage_analysis, track, audio_path
                )

            if options.separation:
                await self._run_stage(
                    job, "separation", self._stage_separation, track, audio_path
                )

            if options.loop_slicing:
                await self._run_stage(job, "loop", self._stage_loop, track, audio_path)

            await self._run_stage(
                job, "project", self._stage_project, track, audio_path
            )
            job.status = "completed"
            job.detail = "Pipeline completed"
            job.completed_at = datetime.now(timezone.utc)
            track.status = "project_ready"
        except Exception as exc:  # pylint: disable=broad-except
            job.status = "failed"
            job.detail = str(exc)
            job.completed_at = datetime.now(timezone.utc)
            track.status = "error"

    async def _run_stage(
        self,
        job: JobRecord,
        stage_id: str,
        func,
        track: TrackRecord,
        *args,
    ) -> Any:
        stage = job.stages[stage_id]
        stage.status = "running"
        stage.progress = 0.05
        job.current_stage = stage_id
        job.detail = stage.detail or stage.label

        try:
            result = await func(job, stage, track, *args)
            stage.status = "done"
            stage.progress = 1.0
            stage.detail = stage.detail or "Completed"

            # Persist track state changes after each stage
            db.save_track(track)

            return result
        except Exception as exc:  # pylint: disable=broad-except
            stage.status = "error"
            stage.detail = str(exc)
            stage.progress = 0.0
            raise

    # ------------------------------------------------------------------
    # Stage implementations
    # ------------------------------------------------------------------
    async def _stage_ingest(
        self,
        job: JobRecord,
        stage: StageState,
        track: TrackRecord,
        payload: schemas.IngestRequest | None,
    ) -> Path:
        if payload is None:
            if track.original_path is None:
                raise RuntimeError("No source provided for reprocessing.")
            return track.original_path

        source = str(payload.source)
        stage.detail = f"Ingesting {source}"
        stage.progress = 0.1

        def _download() -> Path:
            if "://" in source:
                import yt_dlp

                try:
                    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True}) as ydl:
                        info = ydl.extract_info(source, download=False)
                        if info:
                            track.title = info.get("title", track.title)
                            track.artist = info.get("artist") or info.get(
                                "uploader", track.artist
                            )
                except Exception:
                    pass
                return self._downloader.download(source)
            # Check if it's a URL without protocol (e.g., youtu.be/xxx)
            if source.startswith(
                ("youtu.be/", "youtube.com/", "soundcloud.com/", "bandcamp.com/")
            ):
                return self._downloader.download(f"https://{source}")
            # Text query - use yt-dlp search to find and download top result
            search_query = f"ytsearch1:{source}"
            return self._downloader.download(search_query)

        audio_path = _download()

        stage.detail = f"Source staged at {audio_path}"
        stage.progress = 0.9
        track.original_path = audio_path
        track.metadata["source_path"] = str(audio_path)
        track.status = "ingested"
        return audio_path

    async def _stage_analysis(
        self,
        job: JobRecord,
        stage: StageState,
        track: TrackRecord,
        audio_path: Path,
    ) -> Dict[str, Any]:
        stage.detail = "Running beat + key detection"
        stage.progress = 0.2

        def _compute() -> Dict[str, Any]:
            import librosa

            info = sf.info(str(audio_path))
            duration = info.frames / float(info.samplerate)

            # Load audio for analysis
            y, sr = librosa.load(str(audio_path), sr=None, mono=True, duration=120.0)

            # BPM detection
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            bpm = float(tempo)

            # Key detection (simplified - use chromagram)
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            key_idx = int(chroma.mean(axis=1).argmax())
            keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
            key = keys[key_idx]

            return {
                "bpm": bpm,
                "key": key,
                "duration": duration,
                "sample_rate": info.samplerate,
            }

        analysis = _compute()

        stage.progress = 1.0
        stage.detail = f"BPM {analysis['bpm']:.1f} · Key {analysis['key']}"

        track.bpm = analysis["bpm"]
        track.musical_key = analysis["key"]
        track.metadata.update(analysis)
        track.status = "analysed"

        return analysis

    async def _stage_separation(
        self,
        job: JobRecord,
        stage: StageState,
        track: TrackRecord,
        audio_path: Path,
    ) -> Path:
        stage.detail = "Running Demucs separation"
        stage.progress = 0.1
        stems_dir = self._stems_dir(track.slug)

        def _separate() -> Dict[str, Path]:
            from app.services.processing.stem_separator import (
                StemSeparator as DemucsService,
            )

            # Try full Demucs separation
            try:
                stage.detail = "Demucs processing (this may take a few minutes)"
                stage.progress = 0.3

                demucs = DemucsService(self._library.config)
                output_dir = demucs.separate(
                    input_path=audio_path,
                    output_root=stems_dir.parent,
                    force=False,
                    jobs=1,
                )

                # Collect generated stems
                stem_map = {}
                if output_dir.exists():
                    for stem_file in output_dir.iterdir():
                        if stem_file.suffix in (".wav", ".mp3"):
                            stem_name = stem_file.stem
                            target = stems_dir / stem_file.name
                            if not target.exists():
                                shutil.copy2(stem_file, target)
                            stem_map[stem_name] = target

                if stem_map:
                    return stem_map

            except Exception as e:  # pylint: disable=broad-except
                stage.detail = f"Demucs failed, using HPSS fallback: {str(e)[:50]}"
                stage.progress = 0.5

            # Fallback to HPSS if Demucs fails
            info = sf.info(str(audio_path))
            sr = int(info.samplerate)
            data, _ = sf.read(str(audio_path), dtype="float32")
            if data.ndim > 1:
                data = data.mean(axis=1)

            mixdown_path = stems_dir / "mixdown.wav"
            if not mixdown_path.exists():
                sf.write(mixdown_path, data, sr)

            try:
                import librosa

                harmonic, percussive = librosa.effects.hpss(data)
                harmonic_path = stems_dir / "harmonic.wav"
                percussive_path = stems_dir / "percussive.wav"
                sf.write(harmonic_path, harmonic.astype("float32"), sr)
                sf.write(percussive_path, percussive.astype("float32"), sr)
                return {
                    "mixdown": mixdown_path,
                    "harmonic": harmonic_path,
                    "percussive": percussive_path,
                }
            except Exception:  # pylint: disable=broad-except
                return {"mixdown": mixdown_path}

        stem_map = _separate()
        track.stems_dir = stems_dir
        track.stems = [path.name for path in stem_map.values()]
        track.status = "stems_ready"
        stage.detail = f"{len(stem_map)} stems ready"
        stage.progress = 1.0
        return audio_path

    async def _stage_loop(
        self,
        job: JobRecord,
        stage: StageState,
        track: TrackRecord,
        audio_path: Path,
    ) -> List[LoopRecord]:
        bpm = track.bpm or 120.0
        loops_dir = self._loops_dir(track.slug)
        stage.detail = "Quantising audio and slicing loops"
        stage.progress = 0.1

        def _generate() -> List[LoopRecord]:
            info = sf.info(str(audio_path))
            sr = int(info.samplerate)
            data, _ = sf.read(str(audio_path))
            if data.ndim > 1:
                data = data.mean(axis=1)
            data = data.astype("float32", copy=False)
            bars = 4
            samples_per_beat = int(sr * (60.0 / bpm))
            loop_samples = samples_per_beat * 4 * bars
            total_loops = max(1, data.shape[0] // loop_samples)
            results: List[LoopRecord] = []
            loops_dir.mkdir(parents=True, exist_ok=True)

            # Clear existing loops for this run
            for file in loops_dir.glob("loop_*.wav"):
                file.unlink(missing_ok=True)

            for index in range(int(total_loops)):
                start = index * loop_samples
                end = start + loop_samples
                if end > data.shape[0]:
                    if index == 0:
                        pad_amount = end - data.shape[0]
                        slice_audio = np.pad(data[start:], (0, pad_amount))
                    else:
                        break
                else:
                    slice_audio = data[start:end]
                loop_id = f"{track.slug}-loop-{index + 1}"
                file_path = loops_dir / f"{loop_id}.wav"
                sf.write(file_path, slice_audio, sr)
                results.append(
                    LoopRecord(
                        id=loop_id,
                        label=f"Loop {index + 1}",
                        path=file_path,
                        start_bar=index * bars + 1,
                        bar_count=bars,
                        stem="mixdown",
                        bpm=bpm,
                        musical_key=track.musical_key,
                        energy=None,
                    ),
                )

            # Persist loops to DB
            for loop_rec in results:
                db.save_loop(track.track_id, loop_rec)

            return results

        loop_records = _generate()
        stage.progress = 1.0
        stage.detail = f"{len(loop_records)} loops ready"
        self._loop_records[track.track_id] = {loop.id: loop for loop in loop_records}
        track.loops_dir = loops_dir
        track.loops = [loop.id for loop in loop_records]
        track.status = "loops_ready"
        return loop_records

    async def _stage_project(
        self,
        job: JobRecord,
        stage: StageState,
        track: TrackRecord,
        audio_path: Path,
    ) -> None:
        stage.detail = "Preparing project scaffold"
        projects_dir = self._projects_dir(track.slug)
        metadata_path = projects_dir / "session.json"
        content = {
            "track_id": str(track.track_id),
            "title": track.title,
            "bpm": track.bpm,
            "key": track.musical_key,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

        def _write() -> None:
            import json

            with metadata_path.open("w", encoding="utf-8") as handle:
                json.dump(content, handle, indent=2)

        _write()
        stage.progress = 1.0
        stage.detail = f"Project scaffold at {metadata_path}"
        track.status = "project_ready"

    # ------------------------------------------------------------------
    # Library views
    # ------------------------------------------------------------------
    def list_tracks(
        self, limit: int = 50, offset: int = 0
    ) -> schemas.TrackListResponse:
        items = list(self._tracks.values())
        page = items[offset : offset + limit]
        return schemas.TrackListResponse(
            items=[record.to_summary() for record in page], total=len(items)
        )

    def get_track(self, track_id: UUID) -> schemas.TrackDetailResponse:
        record = self._tracks.get(track_id)
        if record is None:
            raise KeyError(f"Track {track_id} not registered")
        return record.to_detail()

    def touch_track(self, track_id: UUID, status: str) -> None:
        record = self._tracks.get(track_id)
        if record:
            record.status = status

    def search_tracks(self, query: schemas.SearchRequest) -> List[schemas.SearchResult]:
        needle = query.query.strip().lower()
        if not needle:
            return []

        results: List[schemas.SearchResult] = []
        for record in self._tracks.values():
            haystack = " ".join(
                filter(
                    None,
                    [
                        record.title,
                        record.artist or "",
                        str(record.metadata.get("collection") or ""),
                        " ".join(record.metadata.get("tags") or []),
                    ],
                )
            ).lower()

            score = self._fuzzy_score(needle, haystack)
            if score == 0.0:
                continue
            results.append(
                schemas.SearchResult(
                    track_id=record.track_id,
                    title=record.title,
                    artist=record.artist,
                    source=record.metadata.get("source", "library"),
                    status=record.status,
                    confidence=score,
                )
            )

        results.sort(key=lambda item: item.confidence, reverse=True)
        return results[:20]

    def list_loops(
        self, track_id: UUID, bar_length: Optional[int] = None
    ) -> List[schemas.LoopPreview]:
        loop_map = self._loop_records.get(track_id, {})
        previews = [loop.to_preview(track_id) for loop in loop_map.values()]
        if bar_length is not None:
            previews = [loop for loop in previews if loop.bar_count == bar_length]
        return previews

    async def reslice_loops(
        self, track_id: UUID, bar_length: int
    ) -> List[schemas.LoopPreview]:
        track = self._tracks.get(track_id)
        if track is None or track.original_path is None:
            raise KeyError(f"Track {track_id} not registered")
        bpm = track.bpm or 120.0

        def _generate() -> List[LoopRecord]:
            info = sf.info(str(track.original_path))
            sr = int(info.samplerate)
            data, _ = sf.read(str(track.original_path))
            if data.ndim > 1:
                data = data.mean(axis=1)
            data = data.astype("float32", copy=False)
            samples_per_beat = int(sr * (60.0 / bpm))
            loop_samples = samples_per_beat * 4 * bar_length
            loops_dir = self._library.loops_dir(track.slug)
            loops_dir.mkdir(parents=True, exist_ok=True)
            records: List[LoopRecord] = []

            total_loops = max(1, data.shape[0] // loop_samples)
            for index in range(int(total_loops)):
                start = index * loop_samples
                end = start + loop_samples
                if end > data.shape[0]:
                    if index == 0:
                        pad_amount = end - data.shape[0]
                        slice_audio = np.pad(data[start:], (0, pad_amount))
                    else:
                        break
                else:
                    slice_audio = data[start:end]
                loop_id = f"{track.slug}-loop-{bar_length}b-{index + 1}"
                file_path = loops_dir / f"{loop_id}.wav"
                sf.write(file_path, slice_audio, sr)
                records.append(
                    LoopRecord(
                        id=loop_id,
                        label=f"{bar_length} bars · take {index + 1}",
                        path=file_path,
                        start_bar=index * bar_length + 1,
                        bar_count=bar_length,
                        stem="mixdown",
                        bpm=bpm,
                        musical_key=track.musical_key,
                    )
                )
            return records

        loop_records = _generate()
        loop_map = {loop.id: loop for loop in loop_records}
        existing = self._loop_records.get(track_id, {})
        existing.update(loop_map)
        self._loop_records[track_id] = existing
        track.loops = list(existing.keys())
        return [loop.to_preview(track_id) for loop in loop_records]

    def get_loop_audio(self, track_id: UUID, loop_id: str) -> Path:
        # Check if it is an AI generated loop map first
        loop_map = self._loop_records.get(track_id, {})
        record = loop_map.get(loop_id)
        if record and record.path.exists():
            return record.path

        track = self.get_track(track_id)
        if not track.loops_dir:
            raise FileNotFoundError("No loops generated yet")

        # It's an exported custom loop
        loop_path = track.loops_dir / f"{loop_id}.wav"
        if not loop_path.exists():
            raise FileNotFoundError(f"Loop not found at {loop_path}")
        return loop_path

    async def extract_custom_loop(
        self, track_id: UUID, start_time: float, end_time: float, stems: list[str]
    ) -> schemas.LoopPreview:
        track = self.get_track(track_id)
        if not track.original_path or not track.original_path.exists():
            raise FileNotFoundError(f"Original audio not found for {track_id}")

        def _generate():
            from app.services.processing.sample_extractor import get_sample_extractor

            xtp = get_sample_extractor()

            # Use sample extractor to do the bounce
            out_path = xtp.extract_custom_sample(
                track_path=track.original_path,
                start_time=start_time,
                end_time=end_time,
                artist=track.artist or "Unknown",
                title=track.title,
                extract_stems=len(stems) > 0,
            )

            # Record it
            import time

            loop_id = f"custom-{int(time.time())}"
            if track.loops_dir:
                dest = track.loops_dir / f"{loop_id}.wav"
                dest.parent.mkdir(parents=True, exist_ok=True)
                import shutil

                shutil.copy(out_path, dest)
                out_path = dest

            return LoopRecord(
                id=loop_id,
                label=f"Custom Loop ({end_time - start_time:.1f}s)",
                path=out_path,
                start_bar=0,
                bar_count=0,
                stem="custom",
                bpm=track.bpm or 120.0,
                musical_key=track.musical_key,
                energy=0.5,
            ).to_preview(track.track_id)

        try:
            return await asyncio.to_thread(_generate)
        except Exception as exc:
            import logging

            logging.error(f"Custom loop failed: {exc}")
            raise KeyError("Failed to slice custom loop")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _downloads_dir(self) -> Path:
        return self._ensure_category_dir(settings.resolved_downloads_dir, "downloads")

    def _stems_dir(self, slug: str) -> Path:
        base = settings.resolved_stems_dir
        return self._ensure_category_dir(base, "stems/separated", slug)

    def _loops_dir(self, slug: str) -> Path:
        base = settings.resolved_loops_dir
        return self._ensure_category_dir(base, "loops/generated", slug)

    def _projects_dir(self, slug: str) -> Path:
        base = settings.resolved_projects_dir
        return self._ensure_category_dir(base, "projects", slug)

    def _ensure_category_dir(
        self, preferred: Path, category: str, slug: Optional[str] = None
    ) -> Path:
        target = preferred / slug if slug else preferred
        try:
            target.mkdir(parents=True, exist_ok=True)
            return target
        except (FileNotFoundError, PermissionError):
            fallback = self._fallback_root / category
            if slug:
                fallback = fallback / slug
            fallback.mkdir(parents=True, exist_ok=True)
            return fallback

    def _derive_title(self, source: str) -> str:
        if "://" in source:
            fragment = source.rstrip("/").split("/")[-1]
            return fragment or "untitled"
        return Path(source).stem or "untitled"

    def _fuzzy_score(self, needle: str, haystack: str) -> float:
        if needle in haystack:
            return min(1.0, 0.6 + 0.4 * (len(needle) / max(len(haystack), 1)))
        tokens = {token for token in needle.split() if token}
        if not tokens:
            return 0.0
        hits = sum(1 for token in tokens if token in haystack)
        if hits == 0:
            return 0.0
        return min(1.0, hits / len(tokens))


pipeline = PipelineOrchestrator()

__all__ = ["pipeline", "PipelineOrchestrator"]
