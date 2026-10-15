"""Pipeline orchestration with real audio processing."""

from __future__ import annotations

import asyncio
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import logging
import numpy as np
import soundfile as sf

from app.api import schemas

logger = logging.getLogger(__name__)
from app.config import settings
from app.security import AUDIO_SUFFIXES, confined_file, copy_into_library, safe_name
from app.services.search.download_service import DownloadService
from app.services.library import LibraryPaths
from app.services.db import db

StageStatus = str  # alias for readability

_STAGE_TEMPLATE: list[tuple[str, str]] = [
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
    detail: str | None = None
    eta_seconds: int | None = None

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
    current_stage: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    detail: str | None = None
    stages: dict[str, StageState] = field(default_factory=dict)
    task: asyncio.Task[None] | None = None

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
    musical_key: str | None
    energy: float | None = None
    tags: list[str] = field(default_factory=list)

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
            tags=self.tags,
            file_url=f"/api/library/tracks/{track_id}/loops/{self.id}/audio",
        )

@dataclass
class TrackRecord:
    track_id: UUID
    slug: str
    title: str
    artist: str | None
    status: str
    created_at: datetime
    bpm: float | None = None
    musical_key: str | None = None
    original_path: Path | None = None
    stems_dir: Path | None = None
    loops_dir: Path | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    stems: list[str] = field(default_factory=list)
    loops: list[str] = field(default_factory=list)

    def to_summary(self) -> schemas.TrackSummary:
        duration = self.metadata.get("duration")
        try:
            duration_val = float(duration) if duration is not None else None
        except (TypeError, ValueError):
            duration_val = None
        return schemas.TrackSummary(
            track_id=self.track_id,
            title=self.title,
            artist=self.artist,
            status=self.status,
            bpm=self.bpm,
            musical_key=self.musical_key,
            created_at=self.created_at,
            duration=duration_val,
            loop_count=len(self.loops),
            stems=list(self.stems),
        )

    def to_detail(self) -> schemas.TrackDetailResponse:
        summary = self.to_summary().model_dump()
        summary["stems"] = list(self.stems)
        return schemas.TrackDetailResponse(
            **summary,
            metadata=self.metadata,
            loops=self.loops,
            provenance={"slug": self.slug},
        )

class PipelineOrchestrator:
    """Coordinates ingest + loop generation pipeline."""

    def __init__(self) -> None:
        self._jobs: dict[UUID, JobRecord] = {}
        self._tracks: dict[UUID, TrackRecord] = {}
        self._loop_records: dict[UUID, dict[str, LoopRecord]] = {}

        # Hydrate from DB on boot
        raw_tracks = db.load_all_tracks()
        for tid, data in raw_tracks.items():
            self._tracks[tid] = TrackRecord(**data)

        raw_loops = db.load_all_loops()
        for tid, loops_map in raw_loops.items():
            self._loop_records[tid] = {
                lid: LoopRecord(**ldata) for lid, ldata in loops_map.items()
            }

        # Hydrate jobs from DB on boot
        raw_jobs = db.load_all_jobs()
        for job_data in raw_jobs:
            jid = job_data["job_id"]
            # Convert stage dicts back to StageState objects
            stages = {}
            for sid, sdata in job_data["stages"].items():
                stages[sid] = StageState(**sdata)
            
            job_record = JobRecord(
                job_id=jid,
                track_id=job_data["track_id"],
                status=job_data["status"],
                current_stage=job_data["current_stage"],
                detail=job_data["detail"],
                started_at=job_data["started_at"],
                completed_at=job_data["completed_at"],
                stages=stages
            )
            
            # If job was running/queued but app restarted, mark as failed or let user retry
            # For now, let's mark incomplete jobs as 'failed' on boot with a 'Server Restart' detail
            if job_record.status in ["running", "queued"]:
                job_record.status = "failed"
                job_record.detail = "Job interrupted by server restart"
                db.save_job(job_record)
                
            self._jobs[jid] = job_record

        self._lock = asyncio.Lock()
        self._library = LibraryPaths(settings)
        self._downloader = DownloadService(settings)
        self._fallback_root = settings.MUSIC_LIBRARY / ".library"
        self._fallback_root.mkdir(parents=True, exist_ok=True)

        # Concurrency: limit parallel processing jobs
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_JOBS)
        # Shutdown flag: set True on SIGTERM to stop new stages from starting
        self._shutting_down = False

        # SSE Event Queues
        self._event_queues: dict[UUID, list[asyncio.Queue]] = {}

    # ------------------------------------------------------------------
    # Job management
    # ------------------------------------------------------------------
    def queue_ingest(self, payload: schemas.IngestRequest) -> schemas.IngestResponse:
        job_id = uuid4()
        track_id = uuid4()
        title = (payload.title or "").strip() or self._derive_title(payload.source)
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
        db.save_job(job_record)

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
        db.save_job(job_record)

        loop = asyncio.get_running_loop()
        job_record.task = loop.create_task(self._run_pipeline(job_record))

        return self.get_job(job_id)

    # ------------------------------------------------------------------
    # SSE Subscription
    # ------------------------------------------------------------------
    async def subscribe(self, job_id: UUID) -> asyncio.Queue:
        """Create a new event queue for an SSE subscriber."""
        q: asyncio.Queue = asyncio.Queue()
        if job_id not in self._event_queues:
            self._event_queues[job_id] = []
        self._event_queues[job_id].append(q)
        return q

    def unsubscribe(self, job_id: UUID, q: asyncio.Queue) -> None:
        """Remove a subscriber queue."""
        if job_id in self._event_queues:
            try:
                self._event_queues[job_id].remove(q)
            except ValueError:
                pass
            if not self._event_queues[job_id]:
                del self._event_queues[job_id]

    def _broadcast(self, job_id: UUID) -> None:
        """Push current job state to all SSE subscribers."""
        if job_id not in self._event_queues:
            return
        try:
            job_data = self.get_job(job_id)
            event = job_data.model_dump(mode="json")
            for q in self._event_queues[job_id]:
                q.put_nowait(event)
        except Exception as e:
            logger.warning("Failed to broadcast job %s: %s", job_id, e)

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

    def list_active_jobs(self) -> list[schemas.JobResponse]:
        """Return all queued or running jobs."""
        return [
            self.get_job(job.job_id)
            for job in self._jobs.values()
            if job.status in ("queued", "running")
        ]

    def delete_track(self, track_id: UUID) -> None:
        if track_id not in self._tracks:
            raise KeyError(f"Track {track_id} not found")
        # Cancel and remove any jobs associated with this track
        for job_id, job in list(self._jobs.items()):
            if job.track_id == track_id:
                if job.task and not job.task.done():
                    job.task.cancel()
                del self._jobs[job_id]
                try:
                    db.delete_job(job_id)
                except Exception:
                    pass

        # Delete track folders and staged download copy (if confined inside downloads_dir)
        try:
            track = self._tracks[track_id]
            projects_dir = settings.resolved_projects_dir / track.slug
            for d in [track.stems_dir, track.loops_dir, projects_dir]:
                if d and d.exists():
                    shutil.rmtree(d, ignore_errors=True)
            if track.original_path and track.original_path.is_file():
                try:
                    dl_root = settings.resolved_downloads_dir.resolve()
                    orig_resolved = track.original_path.resolve()
                    orig_resolved.relative_to(dl_root)
                    orig_resolved.unlink(missing_ok=True)
                except ValueError:
                    pass
        except Exception as e:
            logger.warning("Failed to remove track files for %s: %s", track_id, e)
        del self._tracks[track_id]
        db.delete_track(track_id)
        if track_id in self._loop_records:
            del self._loop_records[track_id]

    async def _run_pipeline(
        self, job: JobRecord, payload: schemas.IngestRequest | None = None
    ) -> None:
        # Surface queue position while waiting for a processing slot
        running = sum(1 for j in self._jobs.values() if j.status == "running")
        if running >= settings.MAX_CONCURRENT_JOBS:
            pos = sum(1 for j in self._jobs.values() if j.status == "queued")
            job.detail = f"Queued — position ~{pos} (max {settings.MAX_CONCURRENT_JOBS} concurrent)"
            db.save_job(job)
            self._broadcast(job.job_id)

        async with self._semaphore:
            if self._shutting_down:
                job.status = "failed"
                job.detail = "Aborted — server shutting down"
                job.completed_at = datetime.now(timezone.utc)
                db.save_job(job)
                self._broadcast(job.job_id)
                return

            job.started_at = datetime.now(timezone.utc)
            job.status = "running"
            job.detail = None
            db.save_job(job)
            self._broadcast(job.job_id)
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
                        job, "separation", self._stage_separation, track, audio_path,
                        options.separation_mode,
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
                db.save_job(job)
                self._broadcast(job.job_id)
            except Exception as exc:  # pylint: disable=broad-except
                logger.exception("Pipeline failed for job %s", job.job_id)
                job.status = "failed"
                job.detail = str(exc)
                job.completed_at = datetime.now(timezone.utc)
                track.status = "error"
                db.save_job(job)
                self._broadcast(job.job_id)

    async def _run_stage(
        self,
        job: JobRecord,
        stage_id: str,
        func,
        track: TrackRecord,
        *args,
    ) -> Any:
        if self._shutting_down:
            raise RuntimeError("Server is shutting down — aborting pipeline")
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

            # Persist job and track state changes after each stage
            db.save_job(job)
            db.save_track(track)
            self._broadcast(job.job_id)

            return result
        except Exception as exc:  # pylint: disable=broad-except
            stage.status = "error"
            stage.detail = str(exc)
            stage.progress = 0.0
            db.save_job(job)
            self._broadcast(job.job_id)
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
            # Check if it's a local file first
            source_path = Path(source).expanduser().resolve()

            if source_path.exists() and source_path.is_file():
                if source_path.suffix.lower() not in AUDIO_SUFFIXES:
                    raise ValueError(f"Unsupported audio type: {source_path.suffix}")
                dest = copy_into_library(source_path, settings.resolved_downloads_dir)
                return dest

            # It's a URL or search query
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

        audio_path = await asyncio.to_thread(_download)

        try:
            conditioning = await asyncio.to_thread(
                self.clean_and_normalize_audio, audio_path
            )
            track.metadata["conditioning"] = conditioning
        except Exception as exc:
            logger.warning("Audio conditioning skipped for %s: %s", audio_path, exc)

        try:
            info = sf.info(str(audio_path))
            track.metadata["duration"] = float(info.duration)
        except Exception:
            pass

        stage.detail = f"Cleaned, DC-centered, normalized & staged at {audio_path.name}"
        stage.progress = 0.9
        track.original_path = audio_path
        track.metadata["source_path"] = str(audio_path)
        track.status = "ingested"
        return audio_path

    @staticmethod
    def clean_and_normalize_audio(audio_path: Path) -> dict[str, Any]:
        """
        Pre-process raw or street-recorded audio:
          1. Remove DC offset per channel (subtracts mean).
          2. Remove sub-sonic rumble (< 25 Hz) via zero-phase FFT high-pass.
          3. Repair clipped peaks via cubic soft-knee harmonic reconstruction.
          4. Peak-normalize to -0.3 dBFS (0.966 linear) for maximum headroom.
        """
        import math

        data, sr = sf.read(str(audio_path), dtype="float32", always_2d=True)
        if data.size == 0:
            return {"cleaned": False}

        # 1. Measure & remove DC offset per channel
        channel_means = np.mean(data, axis=0)
        dc_offset = float(np.max(np.abs(channel_means)))
        data = data - channel_means

        # Measure initial peak & RMS
        peak_before = float(np.max(np.abs(data)))
        peak_before_db = round(20.0 * math.log10(max(peak_before, 1e-9)), 2)

        # 2. Remove < 25 Hz sub-sonic rumble / handling noise via FFT high-pass
        n_samples = data.shape[0]
        if n_samples > 64 and sr > 0:
            freqs = np.fft.rfftfreq(n_samples, d=1.0 / sr)
            hp_mask = np.clip((freqs - 18.0) / (28.0 - 18.0), 0.0, 1.0).astype(
                np.float32
            )
            for ch in range(data.shape[1]):
                spec = np.fft.rfft(data[:, ch])
                data[:, ch] = np.fft.irfft(spec * hp_mask, n=n_samples).astype(
                    np.float32
                )

        # 3. Soft de-clipping if raw recording had clipped samples (> 0.985)
        clipped_count = int(np.sum(np.abs(data) > 0.985))
        if clipped_count > 0:
            data = np.tanh(data * 1.05).astype(np.float32)

        # 4. Normalize peak to -0.3 dBFS (0.96605)
        target_peak = 0.96605
        current_peak = float(np.max(np.abs(data)))
        if current_peak > 1e-6:
            gain = target_peak / current_peak
            # Cap extreme boost on near-silent files at +24 dB
            gain = min(gain, 15.85)
            data = (data * gain).astype(np.float32)

        peak_after = float(np.max(np.abs(data)))
        peak_after_db = round(20.0 * math.log10(max(peak_after, 1e-9)), 2)
        rms_after = float(np.sqrt(np.mean(np.square(data, dtype=np.float64))))
        rms_db = round(20.0 * math.log10(max(rms_after, 1e-9)), 2)

        # Write back preserving channel layout
        out_data = data[:, 0] if data.shape[1] == 1 else data
        sf.write(str(audio_path), out_data, sr)

        return {
            "cleaned": True,
            "dc_offset_removed": round(dc_offset, 6),
            "highpass_hz": 25.0,
            "declipped_samples": clipped_count,
            "normalized": True,
            "target_dbfs": -0.3,
            "peak_before_db": peak_before_db,
            "peak_after_db": peak_after_db,
            "rms_db": rms_db,
            "sample_rate": int(sr),
            "channels": int(data.shape[1]),
        }

    async def clean_track(self, track_id: UUID) -> dict[str, Any]:
        """Run DC offset removal, cleanup, and normalization on an existing track."""
        track = self._tracks.get(track_id)
        if track is None or not track.original_path or not track.original_path.exists():
            raise KeyError(f"Track {track_id} not registered or missing audio")
        audio_path = confined_file(
            settings.MUSIC_LIBRARY, track.original_path, suffixes=AUDIO_SUFFIXES
        )
        result = await asyncio.to_thread(self.clean_and_normalize_audio, audio_path)
        track.metadata["conditioning"] = result
        db.save_track(track)
        return result

    async def _stage_analysis(
        self,
        job: JobRecord,
        stage: StageState,
        track: TrackRecord,
        audio_path: Path,
    ) -> dict[str, Any]:
        stage.detail = "Running allin1 analysis (beats · key · chords · structure)"
        stage.progress = 0.2

        def _compute() -> dict[str, Any]:
            from app.services.analysis.mlx_analyzer import analyze_track
            return analyze_track(audio_path)

        analysis = await asyncio.to_thread(_compute)

        stage.progress = 1.0
        bpm = analysis["bpm"]
        key = analysis["key"]
        n_beats = len(analysis.get("beats", []))
        n_segs = len(analysis.get("segments", []))
        stage.detail = (
            f"BPM {bpm:.1f} · Key {key} · {n_beats} beats · {n_segs} sections"
        )

        track.bpm = bpm
        track.musical_key = key
        track.metadata.update(analysis)
        track.status = "analysed"

        return analysis

    async def _stage_separation(
        self,
        job: JobRecord,
        stage: StageState,
        track: TrackRecord,
        audio_path: Path,
        separation_mode: str = "fast",
    ) -> Path:
        stage.detail = f"Running separation (mode={separation_mode})"
        stage.progress = 0.1
        stems_dir = self._stems_dir(track.slug)
        stems_dir.mkdir(parents=True, exist_ok=True)

        def _separate() -> dict[str, Path]:
            # --- Tier 2: MelBand-Roformer (SDR 12.6, vocal quality mode) ---
            if separation_mode == "vocal_quality":
                try:
                    import tempfile
                    from mlx_audio_separator import Separator as RoformerSep

                    stage.detail = "Roformer: loading MelBand-Roformer vocal model"
                    stage.progress = 0.2
                    sep = RoformerSep(
                        output_dir=str(stems_dir),
                        output_format="WAV",
                    )
                    sep.load_model("model_bs_roformer_ep_317_sdr_12.9755.ckpt")

                    stage.detail = "Roformer: separating vocals"
                    stage.progress = 0.4
                    output_files = sep.separate(str(audio_path))

                    # output_files: list of stem paths written to stems_dir
                    stem_map: dict[str, Path] = {}
                    for fpath in output_files:
                        p = Path(fpath)
                        # Roformer names are like "trackname_(Vocals).wav"
                        raw = p.stem.lower()
                        if "vocal" in raw:
                            stem_map["vocals"] = p
                        elif "instrumental" in raw or "no_vocal" in raw or "minus" in raw:
                            stem_map["instrumental"] = p
                        else:
                            stem_map[raw.split("_(")[-1].rstrip(")")] = p

                    stage.progress = 0.9
                    return stem_map

                except Exception as exc:  # pylint: disable=broad-except
                    logger.warning("Roformer failed (%s), falling back to demucs-mlx", exc)
                    stage.detail = f"Roformer failed, falling back: {str(exc)[:60]}"
                    stage.progress = 0.3

            # --- Tier 1: demucs-mlx (native Apple Silicon MLX, ~73× realtime on M4) ---
            try:
                from demucs_mlx import Separator, save_audio

                stage.detail = "demucs-mlx: loading htdemucs_6s model"
                stage.progress = 0.2
                sep = Separator(
                    model="htdemucs_6s",
                    shifts=1,
                    overlap=0.25,
                    # No segment override — use model's training length (~7.8s)
                    # which is the safe maximum. batch_size=1 caps peak RAM.
                    batch_size=1,
                )

                stage.detail = "demucs-mlx: separating stems"
                stage.progress = 0.3
                _, stems = sep.separate_audio_file(audio_path)
                # stems: {"drums": ndarray, "bass": ndarray, "vocals": ndarray,
                #         "guitar": ndarray, "piano": ndarray, "other": ndarray}

                stem_map: dict[str, Path] = {}
                for stem_name, audio in stems.items():
                    out_path = stems_dir / f"{stem_name}.wav"
                    save_audio(audio, out_path, sep.samplerate, bits_per_sample=24)
                    stem_map[stem_name] = out_path

                stage.progress = 0.9
                return stem_map

            except Exception as exc:  # pylint: disable=broad-except
                logger.warning("demucs-mlx failed (%s), trying standard demucs", exc)
                stage.detail = f"demucs-mlx unavailable, trying standard demucs: {str(exc)[:50]}"
                stage.progress = 0.25

            # --- Tier 1.5: standard demucs (torch, MPS/CPU) ---
            try:
                import demucs.api

                stage.detail = "demucs: loading htdemucs_6s model"
                stage.progress = 0.3
                sep = demucs.api.Separator(
                    model="htdemucs_6s",
                    shifts=1,
                    overlap=0.25,
                    device=settings.DEMUCS_DEVICE,
                )

                stage.detail = "demucs: separating 6 stems (this takes a while)…"
                stage.progress = 0.4
                _, stems_dict = sep.separate_audio_file(audio_path)

                stem_map: dict[str, Path] = {}
                for stem_name, audio_tensor in stems_dict.items():
                    out_path = stems_dir / f"{stem_name}.wav"
                    # demucs returns torch tensors: (channels, samples)
                    import torchaudio
                    torchaudio.save(str(out_path), audio_tensor.cpu(), sep.samplerate)
                    stem_map[stem_name] = out_path

                stage.progress = 0.9
                return stem_map

            except Exception as exc:  # pylint: disable=broad-except
                logger.warning("Standard demucs failed (%s), falling back to 6-stem DSP separator", exc)
                stage.detail = f"demucs unavailable, using 6-stem DSP separator: {str(exc)[:50]}"
                stage.progress = 0.5

            # --- Fallback: 6-stem spectral + transient/sustained DSP separator ---
            return PipelineOrchestrator._dsp_six_stem_fallback(audio_path, stems_dir)

        # Hard timeout: demucs can freeze the OS if it OOMs. 8 min is generous for M4.
        try:
            stem_map = await asyncio.wait_for(
                asyncio.to_thread(_separate),
                timeout=480,
            )
        except asyncio.TimeoutError:
            logger.error("Stem separation timed out after 8 minutes — falling back to 6-stem DSP")
            stage.detail = "Separation timed out — using 6-stem DSP fallback"
            stem_map = await asyncio.to_thread(
                PipelineOrchestrator._dsp_six_stem_fallback, audio_path, stems_dir
            )
        track.stems_dir = stems_dir
        track.stems = [path.name for path in stem_map.values()]
        track.status = "stems_ready"
        stage.detail = f"{len(stem_map)} stems ready ({', '.join(stem_map.keys())})"
        stage.progress = 1.0
        return audio_path

    @staticmethod
    def _dsp_six_stem_fallback(audio_path: Path, stems_dir: Path) -> dict[str, Path]:
        """
        Deterministic 6-stem spectral + transient/harmonic decomposition fallback
        when Demucs MLX / PyTorch models are unavailable.
        Always produces the 6 canonical stems:
          drums.wav, bass.wav, vocals.wav, guitar.wav, piano.wav, other.wav
        """
        stems_dir.mkdir(parents=True, exist_ok=True)
        data, sr = sf.read(str(audio_path), dtype="float32", always_2d=True)
        n_samples = data.shape[0]
        mono = data.mean(axis=1).astype(np.float32)
        side = (
            ((data[:, 0] - data[:, 1]) * 0.5).astype(np.float32)
            if data.shape[1] >= 2
            else np.zeros_like(mono)
        )

        freqs = np.fft.rfftfreq(n_samples, d=1.0 / max(sr, 1))
        spec_mono = np.fft.rfft(mono)
        spec_side = np.fft.rfft(side)

        def _bandpass(spec: np.ndarray, f_lo: float, f_hi: float, roll: float = 35.0) -> np.ndarray:
            lo_mask = np.clip((freqs - (f_lo - roll)) / max(roll, 1.0), 0.0, 1.0) if f_lo > 0 else np.ones_like(freqs)
            hi_mask = np.clip(((f_hi + roll) - freqs) / max(roll, 1.0), 0.0, 1.0)
            mask = (lo_mask * hi_mask).astype(np.float32)
            return np.fft.irfft(spec * mask, n=n_samples).astype(np.float32)

        # Compute fast vs slow envelope for transient (percussive) vs sustained (harmonic) split
        abs_env = np.abs(mono)
        fast_win = max(1, int(sr * 0.006))
        slow_win = max(1, int(sr * 0.065))
        fast_env = np.convolve(abs_env, np.ones(fast_win, dtype=np.float32) / fast_win, mode="same")
        slow_env = np.convolve(abs_env, np.ones(slow_win, dtype=np.float32) / slow_win, mode="same") + 1e-6
        transient_mask = np.clip((fast_env - slow_env * 0.85) / (fast_env + 1e-6) * 2.4, 0.0, 1.0).astype(np.float32)
        sustained_mask = (1.0 - 0.65 * transient_mask).astype(np.float32)

        # 1. Bass (20 - 210 Hz sustained + punch)
        bass = _bandpass(spec_mono, 20.0, 210.0, roll=25.0)
        # 2. Drums (transient component across full range + kick punch 45-130 Hz + hats > 5 kHz)
        kick_band = _bandpass(spec_mono, 42.0, 135.0, roll=20.0) * transient_mask
        top_perc = _bandpass(spec_mono, 4800.0, min(18000.0, sr * 0.48), roll=300.0) * (0.4 + 0.6 * transient_mask)
        drums = np.clip(mono * transient_mask * 0.9 + kick_band * 0.6 + top_perc * 0.4, -0.99, 0.99).astype(np.float32)
        # 3. Vocals (center-channel formant band 240 - 3800 Hz, sustained)
        vocals = (_bandpass(spec_mono, 240.0, 3800.0, roll=80.0) * sustained_mask).astype(np.float32)
        # 4. Piano (harmonic low-mid & fundamental chord register 160 - 1600 Hz)
        piano = (_bandpass(spec_mono, 160.0, 1600.0, roll=60.0) * sustained_mask * 0.85).astype(np.float32)
        # 5. Guitar (upper-mid presence & stereo edge 700 - 4600 Hz)
        guitar_mid = _bandpass(spec_mono, 700.0, 4600.0, roll=120.0) * sustained_mask * 0.65
        guitar_side = _bandpass(spec_side, 400.0, 5000.0, roll=100.0) * 0.55
        guitar = np.clip(guitar_mid + guitar_side, -0.99, 0.99).astype(np.float32)
        # 6. Other (synth pads, air, wide stereo ambience, residual)
        high_air = _bandpass(spec_mono, 2200.0, min(19000.0, sr * 0.48), roll=200.0) * sustained_mask * 0.6
        other = np.clip(high_air + side * 0.45, -0.99, 0.99).astype(np.float32)

        stems_audio = {
            "drums": drums,
            "bass": bass,
            "vocals": vocals,
            "guitar": guitar,
            "piano": piano,
            "other": other,
        }
        stem_map: dict[str, Path] = {}
        for name, sig in stems_audio.items():
            out_path = stems_dir / f"{name}.wav"
            sf.write(str(out_path), sig, sr)
            stem_map[name] = out_path
        return stem_map

    @staticmethod
    def _compute_energy(audio: "np.ndarray", sr: int) -> float:
        """Compute normalised RMS energy 0.0-1.0."""
        import math

        if audio.size == 0:
            return 0.0
        mean_rms = float(np.sqrt(np.mean(np.square(audio, dtype=np.float64))))
        if mean_rms <= 0:
            return 0.0
        db = 20 * math.log10(mean_rms)
        return max(0.0, min(1.0, (db + 60) / 60))

    @staticmethod
    def _auto_tags(energy: float, bpm: float, key: str | None) -> list[str]:
        """Generate automatic tags from loop properties."""
        tags: list[str] = []
        if energy >= 0.75:
            tags.append("high-energy")
        elif energy <= 0.25:
            tags.append("low-energy")
        if bpm:
            if bpm < 90:
                tags.append("slow")
            elif bpm > 140:
                tags.append("fast")
            else:
                tags.append(f"{int(round(bpm / 10) * 10)}bpm")
        if key:
            tags.append(key.lower())
        return tags

    async def _stage_loop(
        self,
        job: JobRecord,
        stage: StageState,
        track: TrackRecord,
        audio_path: Path,
    ) -> list[LoopRecord]:
        bpm = track.bpm or 120.0
        loops_dir = self._loops_dir(track.slug)
        stage.detail = "Quantising audio and slicing loops"
        stage.progress = 0.1

        def _generate() -> list[LoopRecord]:
            info = sf.info(str(audio_path))
            sr = int(info.samplerate)
            data, _ = sf.read(str(audio_path))
            if data.ndim > 1:
                data = data.mean(axis=1)
            data = data.astype("float32", copy=False)
            bars = 4
            samples_per_beat = int(sr * (60.0 / bpm))
            loop_samples = samples_per_beat * 4 * bars

            # Beatgrid anchor — the first true downbeat (Traktor-style).
            # All bar positions derive from: anchor + N * bar_duration.
            # This prevents accumulated drift caused by phase uncertainty.
            raw_anchor: float = track.metadata.get("beatgrid_anchor") or 0.0
            anchor_samples = max(0, int(raw_anchor * sr))

            # How many complete 4-bar loops fit after the anchor?
            usable_samples = data.shape[0] - anchor_samples
            total_loops = max(1, usable_samples // loop_samples)
            results: list[LoopRecord] = []
            loops_dir.mkdir(parents=True, exist_ok=True)

            # Clear existing loops for this run
            for file in loops_dir.glob("loop_*.wav"):
                file.unlink(missing_ok=True)

            for index in range(int(total_loops)):
                start = anchor_samples + index * loop_samples
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
                slice_energy = PipelineOrchestrator._compute_energy(slice_audio, sr)
                loop_tags = PipelineOrchestrator._auto_tags(
                    slice_energy, bpm, track.musical_key
                )
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
                        energy=slice_energy,
                        tags=loop_tags,
                    ),
                )

            # Also slice ready-made one-touch structural section loops
            # (intro, outro, drop, breakdown, chorus) identified during analysis
            segments = track.metadata.get("segments") or []
            bar_seconds = (60.0 / bpm) * 4.0 if bpm > 0 else 2.0
            for seg_idx, seg in enumerate(segments):
                seg_label = str(seg.get("label") or seg.get("type") or "section").lower()
                s_time = float(seg.get("start_time") or seg.get("start") or 0.0)
                e_time = float(seg.get("end_time") or seg.get("end") or 0.0)
                if e_time <= s_time:
                    continue
                # Cap structural one-touch loop length to 8 bars so it's immediately playable
                max_sec = bar_seconds * 8.0
                if e_time - s_time > max_sec:
                    e_time = s_time + max_sec
                s_idx = max(0, min(int(round(s_time * sr)), data.shape[0]))
                e_idx = max(s_idx, min(int(round(e_time * sr)), data.shape[0]))
                if e_idx - s_idx < int(sr * 0.25):
                    continue
                seg_audio = data[s_idx:e_idx]
                seg_loop_id = f"{track.slug}-{seg_label}-{seg_idx + 1}"
                seg_file_path = loops_dir / f"{seg_loop_id}.wav"
                sf.write(seg_file_path, seg_audio, sr)
                seg_energy = PipelineOrchestrator._compute_energy(seg_audio, sr)
                seg_bars = max(1, int(round((e_time - s_time) / bar_seconds)))
                seg_start_bar = int(seg.get("start_bar") or max(1, int(round(s_time / bar_seconds)) + 1))
                seg_tags = PipelineOrchestrator._auto_tags(
                    seg_energy, bpm, track.musical_key
                )
                for extra_tag in ("section", seg_label):
                    if extra_tag not in seg_tags:
                        seg_tags.append(extra_tag)
                results.append(
                    LoopRecord(
                        id=seg_loop_id,
                        label=f"{seg_label.capitalize()} ({seg_bars}B)",
                        path=seg_file_path,
                        start_bar=seg_start_bar,
                        bar_count=seg_bars,
                        stem="mixdown",
                        bpm=bpm,
                        musical_key=track.musical_key,
                        energy=seg_energy,
                        tags=seg_tags,
                    )
                )

            # Persist loops to DB
            for loop_rec in results:
                db.save_loop(track.track_id, loop_rec)

            return results

        loop_records = await asyncio.to_thread(_generate)
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

        await asyncio.to_thread(_write)
        stage.progress = 1.0
        stage.detail = f"Project scaffold at {metadata_path}"
        track.status = "project_ready"

    # ------------------------------------------------------------------
    # Library views
    # ------------------------------------------------------------------
    def list_tracks(
        self, limit: int = 50, offset: int = 0
    ) -> schemas.TrackListResponse:
        items = sorted(self._tracks.values(), key=lambda t: t.created_at, reverse=True)
        page = items[offset : offset + limit]
        return schemas.TrackListResponse(
            items=[record.to_summary() for record in page], total=len(items)
        )

    def get_stats(self) -> schemas.LibraryStats:
        stemmed = {"stems_ready", "loops_ready", "project_ready", "completed", "done"}
        stemming = {"queued", "running", "pending"}
        tracks = list(self._tracks.values())
        return schemas.LibraryStats(
            total_tracks=len(tracks),
            stems_ready=sum(1 for t in tracks if t.status in stemmed),
            loops_exported=sum(len(v) for v in self._loop_records.values()),
            processing=sum(1 for t in tracks if t.status in stemming),
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

    def search_tracks(self, query: schemas.SearchRequest) -> list[schemas.SearchResult]:
        needle = query.query.strip().lower()
        if not needle:
            return []

        results: list[schemas.SearchResult] = []
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
        self, track_id: UUID, bar_length: int | None = None
    ) -> list[schemas.LoopPreview]:
        loop_map = self._loop_records.get(track_id, {})
        previews = [loop.to_preview(track_id) for loop in loop_map.values()]
        if bar_length is not None:
            previews = [loop for loop in previews if loop.bar_count == bar_length]
        return previews

    async def reslice_loops(
        self, track_id: UUID, bar_length: int
    ) -> list[schemas.LoopPreview]:
        track = self._tracks.get(track_id)
        if track is None or track.original_path is None or not track.original_path.exists():
            raise KeyError(f"Track {track_id} not registered")
        bpm = float(track.bpm or 120.0)
        if bpm <= 0:
            bpm = 120.0
        loops_dir = track.loops_dir or self._loops_dir(track.slug)

        def _generate() -> list[LoopRecord]:
            info = sf.info(str(track.original_path))
            sr = int(info.samplerate)
            data, _ = sf.read(str(track.original_path))
            if data.ndim > 1:
                data = data.mean(axis=1)
            data = data.astype("float32", copy=False)
            samples_per_beat = max(1, int(sr * (60.0 / bpm)))
            loop_samples = max(1, samples_per_beat * 4 * bar_length)
            loops_dir.mkdir(parents=True, exist_ok=True)
            records: list[LoopRecord] = []

            # Use stored beatgrid anchor so bars are phase-locked
            raw_anchor: float = track.metadata.get("beatgrid_anchor") or 0.0
            anchor_samples = max(0, int(raw_anchor * sr))
            usable_samples = max(0, data.shape[0] - anchor_samples)
            total_loops = max(1, usable_samples // loop_samples)
            for index in range(int(total_loops)):
                start = anchor_samples + index * loop_samples
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
                slice_energy = PipelineOrchestrator._compute_energy(slice_audio, sr)
                loop_tags = PipelineOrchestrator._auto_tags(
                    slice_energy, bpm, track.musical_key
                )
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
                        energy=slice_energy,
                        tags=loop_tags,
                    )
                )
            return records

        loop_records = await asyncio.to_thread(_generate)
        loop_map = {loop.id: loop for loop in loop_records}
        existing = self._loop_records.get(track_id, {})
        existing.update(loop_map)
        self._loop_records[track_id] = existing
        track.loops_dir = loops_dir
        track.loops = list(existing.keys())
        db.save_track(track)
        for loop_rec in loop_records:
            db.save_loop(track_id, loop_rec)
        return [loop.to_preview(track_id) for loop in loop_records]

    def get_loop_audio(self, track_id: UUID, loop_id: str) -> Path:
        loop_id = safe_name(loop_id)
        loop_map = self._loop_records.get(track_id, {})
        record = loop_map.get(loop_id)
        if record and record.path.exists():
            return confined_file(settings.MUSIC_LIBRARY, record.path, suffixes=AUDIO_SUFFIXES)

        track = self._tracks.get(track_id)
        if track is None:
            raise KeyError(f"Track {track_id} not registered")
        if not track.loops_dir:
            raise FileNotFoundError("No loops generated yet")

        loop_path = track.loops_dir / f"{loop_id}.wav"
        return confined_file(settings.MUSIC_LIBRARY, loop_path, suffixes=AUDIO_SUFFIXES)

    async def extract_custom_loop(
        self, track_id: UUID, start_time: float, end_time: float, stems: list[str]
    ) -> schemas.LoopPreview:
        from fastapi import HTTPException
        from app.security import AUDIO_SUFFIXES, confined_file, safe_name

        track = self._tracks.get(track_id)
        if track is None:
            raise KeyError(f"Track {track_id} not registered")
        if end_time <= start_time:
            raise ValueError("end_time must be greater than start_time")

        def _generate() -> schemas.LoopPreview:
            import time
            import uuid
            import numpy as np
            import soundfile as sf

            # Resolve stem files if stems were requested and stems_dir exists
            selected_paths: list[Path] = []
            if stems and track.stems_dir and track.stems_dir.exists():
                for raw_stem in stems:
                    clean = safe_name(raw_stem)
                    stem_key = clean[:-4] if clean.lower().endswith(".wav") else clean
                    for cand in (track.stems_dir / f"{stem_key}.wav", track.stems_dir / clean):
                        if cand.is_file():
                            selected_paths.append(
                                confined_file(settings.MUSIC_LIBRARY, cand, suffixes=AUDIO_SUFFIXES)
                            )
                            break

            if not selected_paths:
                if not track.original_path or not track.original_path.exists():
                    raise FileNotFoundError(f"Original audio not found for {track_id}")
                selected_paths = [
                    confined_file(settings.MUSIC_LIBRARY, track.original_path, suffixes=AUDIO_SUFFIXES)
                ]

            mixed: np.ndarray | None = None
            target_sr = 44100
            for path in selected_paths:
                info = sf.info(str(path))
                sr = info.samplerate
                s_frame = max(0, min(int(round(start_time * sr)), info.frames))
                e_frame = max(s_frame, min(int(round(end_time * sr)), info.frames))
                if e_frame <= s_frame:
                    continue
                chunk, sr = sf.read(str(path), start=s_frame, stop=e_frame, dtype="float32", always_2d=True)
                if mixed is None:
                    mixed = chunk
                    target_sr = sr
                else:
                    if sr != target_sr and chunk.shape[0] > 0:
                        import math

                        try:
                            from scipy.signal import resample_poly

                            g = math.gcd(target_sr, sr)
                            chunk = np.asarray(
                                resample_poly(chunk, target_sr // g, sr // g, axis=0),
                                dtype="float32",
                            )
                        except ImportError:
                            n_in = chunk.shape[0]
                            n_out = max(1, int(round(n_in * target_sr / sr)))
                            x_old = np.linspace(0.0, 1.0, n_in, endpoint=False)
                            x_new = np.linspace(0.0, 1.0, n_out, endpoint=False)
                            chunk = np.column_stack(
                                [
                                    np.interp(x_new, x_old, chunk[:, ch]).astype(np.float32)
                                    for ch in range(chunk.shape[1])
                                ]
                            )
                    if mixed.shape[1] != chunk.shape[1]:
                        if mixed.shape[1] == 1 and chunk.shape[1] == 2:
                            mixed = np.repeat(mixed, 2, axis=1)
                        elif chunk.shape[1] == 1 and mixed.shape[1] == 2:
                            chunk = np.repeat(chunk, 2, axis=1)
                    min_len = min(len(mixed), len(chunk))
                    mixed = mixed[:min_len] + chunk[:min_len]

            if mixed is None or len(mixed) == 0:
                raise ValueError("Selected time range produced an empty audio slice")

            peak = float(np.max(np.abs(mixed)))
            if peak > 0.99:
                mixed = mixed * (0.98 / peak)

            loops_dir = track.loops_dir or self._loops_dir(track.slug)
            loops_dir.mkdir(parents=True, exist_ok=True)
            track.loops_dir = loops_dir

            loop_id = f"custom-{int(time.time())}-{uuid.uuid4().hex[:6]}"
            out_path = loops_dir / f"{loop_id}.wav"
            sf.write(str(out_path), mixed, target_sr)

            bpm = float(track.bpm or 120.0)
            bar_seconds = (60.0 / bpm) * 4.0 if bpm > 0 else 2.0
            duration = max(0.0, end_time - start_time)
            bar_count = max(1, int(round(duration / bar_seconds)))
            start_bar = max(1, int(round(start_time / bar_seconds)) + 1)
            rms_energy = min(1.0, float(np.sqrt(np.mean(mixed**2))) * 3.0)
            stem_label = "+".join(s.replace(".wav", "") for s in stems) if stems else "custom"

            record = LoopRecord(
                id=loop_id,
                label=f"Custom Loop ({duration:.1f}s)",
                path=out_path,
                start_bar=start_bar,
                bar_count=bar_count,
                stem=stem_label,
                bpm=bpm,
                musical_key=track.musical_key,
                energy=round(rms_energy, 3),
                tags=["custom"],
            )
            existing = self._loop_records.get(track_id, {})
            if not isinstance(existing, dict):
                existing = {r.id: r for r in existing}
            existing[loop_id] = record
            self._loop_records[track_id] = existing
            if loop_id not in track.loops:
                track.loops.append(loop_id)
            db.save_track(track)
            db.save_loop(track_id, record)
            return record.to_preview(track.track_id)

        try:
            return await asyncio.to_thread(_generate)
        except HTTPException:
            raise
        except Exception as exc:
            import logging

            logging.error(f"Custom loop failed: {exc}")
            raise KeyError("Failed to slice custom loop")

    async def save_loop_bundle(
        self,
        track_id: UUID,
        start_time: float,
        end_time: float,
        label: str | None = None,
        include_all_stems: bool = True,
        post_production: bool = True,
    ) -> dict[str, Any]:
        """
        Save a complete loop version AND all 6 individual stems of that loop
        as ready-to-use loop format files in the track's loops collection.
        """
        track = self._tracks.get(track_id)
        if track is None:
            raise KeyError(f"Track {track_id} not registered")
        if end_time <= start_time:
            raise ValueError("end_time must be greater than start_time")

        def _generate_bundle() -> dict[str, Any]:
            import time
            import uuid

            loops_dir = track.loops_dir or self._loops_dir(track.slug)
            loops_dir.mkdir(parents=True, exist_ok=True)
            track.loops_dir = loops_dir

            stems_dir = track.stems_dir or self._stems_dir(track.slug)
            canonical_stems = ["drums", "bass", "vocals", "guitar", "piano", "other"]

            # Ensure 6 stems exist if include_all_stems is requested
            if include_all_stems and track.original_path and track.original_path.exists():
                missing = [
                    s for s in canonical_stems if not (stems_dir / f"{s}.wav").is_file()
                ]
                if missing:
                    stems_dir.mkdir(parents=True, exist_ok=True)
                    stem_map = self._dsp_six_stem_fallback(track.original_path, stems_dir)
                    track.stems_dir = stems_dir
                    track.stems = [p.name for p in stem_map.values()]

            bpm = float(track.bpm or 120.0)
            bar_seconds = (60.0 / bpm) * 4.0 if bpm > 0 else 2.0
            duration = max(0.0, end_time - start_time)
            bar_count = max(1, int(round(duration / bar_seconds)))
            start_bar = max(1, int(round(start_time / bar_seconds)) + 1)
            base_label = (label or f"Bar {start_bar} ({bar_count}B)").strip()
            bundle_tag = f"bundle-{int(time.time())}-{uuid.uuid4().hex[:4]}"

            def _slice_and_condition(src_path: Path, apply_master: bool) -> tuple[np.ndarray, int]:
                p = confined_file(settings.MUSIC_LIBRARY, src_path, suffixes=AUDIO_SUFFIXES)
                info = sf.info(str(p))
                sr = int(info.samplerate)
                s_frame = max(0, min(int(round(start_time * sr)), info.frames))
                e_frame = max(s_frame, min(int(round(end_time * sr)), info.frames))
                if e_frame <= s_frame:
                    raise ValueError("Selected time range produced an empty slice")
                chunk, sr = sf.read(str(p), start=s_frame, stop=e_frame, dtype="float32", always_2d=True)
                # Remove DC offset
                chunk = chunk - np.mean(chunk, axis=0)
                if apply_master:
                    # Studio Post-Production polish: harmonic warmth + peak normalize to -0.3 dBFS
                    chunk = np.tanh(chunk * 1.12).astype(np.float32)
                    pk = float(np.max(np.abs(chunk)))
                    if pk > 1e-6:
                        chunk = (chunk * (0.96605 / pk)).astype(np.float32)
                else:
                    pk = float(np.max(np.abs(chunk)))
                    if pk > 0.99:
                        chunk = (chunk * (0.98 / pk)).astype(np.float32)
                out_arr = chunk[:, 0] if chunk.shape[1] == 1 else chunk
                return out_arr, sr

            created_records: list[LoopRecord] = []

            # 1. Complete Full Loop
            if track.original_path and track.original_path.exists():
                full_audio, sr = _slice_and_condition(track.original_path, post_production)
                full_id = safe_name(f"{bundle_tag}-complete")
                full_path = loops_dir / f"{full_id}.wav"
                sf.write(str(full_path), full_audio, sr)
                energy = self._compute_energy(full_audio, sr)
                rec = LoopRecord(
                    id=full_id,
                    label=f"{base_label} · Complete Loop",
                    path=full_path,
                    start_bar=start_bar,
                    bar_count=bar_count,
                    stem="mixdown",
                    bpm=bpm,
                    musical_key=track.musical_key,
                    energy=round(energy, 3),
                    tags=["bundle", "complete-loop", "mastered" if post_production else "raw"],
                )
                created_records.append(rec)

            # 2. All 6 Stem Loops of this exact loop region
            if include_all_stems and stems_dir and stems_dir.exists():
                for stem_name in canonical_stems:
                    stem_file = stems_dir / f"{stem_name}.wav"
                    if not stem_file.is_file():
                        continue
                    stem_audio, sr = _slice_and_condition(stem_file, post_production)
                    stem_loop_id = safe_name(f"{bundle_tag}-{stem_name}")
                    stem_loop_path = loops_dir / f"{stem_loop_id}.wav"
                    sf.write(str(stem_loop_path), stem_audio, sr)
                    stem_energy = self._compute_energy(stem_audio, sr)
                    rec = LoopRecord(
                        id=stem_loop_id,
                        label=f"{base_label} · {stem_name.capitalize()} Stem",
                        path=stem_loop_path,
                        start_bar=start_bar,
                        bar_count=bar_count,
                        stem=stem_name,
                        bpm=bpm,
                        musical_key=track.musical_key,
                        energy=round(stem_energy, 3),
                        tags=["bundle", "stem-loop", stem_name],
                    )
                    created_records.append(rec)

            existing = self._loop_records.get(track_id, {})
            if not isinstance(existing, dict):
                existing = {r.id: r for r in existing}
            for rec in created_records:
                existing[rec.id] = rec
                if rec.id not in track.loops:
                    track.loops.append(rec.id)
                db.save_loop(track_id, rec)
            self._loop_records[track_id] = existing
            db.save_track(track)

            previews = [rec.to_preview(track_id) for rec in created_records]
            return {
                "bundle_id": bundle_tag,
                "track_id": str(track_id),
                "label": base_label,
                "start_time": start_time,
                "end_time": end_time,
                "bar_count": bar_count,
                "post_production": post_production,
                "complete_loop": previews[0] if previews else None,
                "stem_loops": previews[1:] if len(previews) > 1 else [],
                "total_saved": len(previews),
            }

        return await asyncio.to_thread(_generate_bundle)

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
        self, preferred: Path, category: str, slug: str | None = None
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

    def get_stem_path(self, track_id: UUID, stem_name: str) -> Path:
        """Return the filesystem path for a named stem WAV file."""
        stem_name = safe_name(stem_name)
        record = self._tracks.get(track_id)
        if record is None:
            raise KeyError(f"Track {track_id} not found")
        stems_dir = record.stems_dir or self._stems_dir(record.slug)
        for suffix in (stem_name, f"{stem_name}.wav"):
            candidate = stems_dir / suffix
            if candidate.exists():
                return confined_file(
                    settings.MUSIC_LIBRARY, candidate, suffixes=AUDIO_SUFFIXES
                )
        raise FileNotFoundError(f"Stem '{stem_name}' not found in {stems_dir}")

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
