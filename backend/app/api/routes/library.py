"""Library browsing endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse

from app.api.schemas import (
    JobResponse,
    LibraryStats,
    LoopPreview,
    LoopResliceRequest,
    ProcessJobRequest,
    SearchRequest,
    SearchResult,
    TrackDetailResponse,
    TrackListResponse,
)
from pydantic import BaseModel
from app.services.pipeline import pipeline


class CustomLoopRequest(BaseModel):
    start_time: float
    end_time: float
    stems: list[str] = []


class SurgicalExtractRequest(BaseModel):
    description: str  # e.g. "kick drum", "bass riff", "lead vocal"


router = APIRouter(prefix="/library", tags=["library"])


def _parse_uuid(value: str) -> UUID:
    """Parse a UUID string, raising HTTP 400 on invalid input."""
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/search", response_model=list[SearchResult])
async def search_tracks(payload: SearchRequest) -> list[SearchResult]:
    return pipeline.search_tracks(payload)


@router.get("/stats", response_model=LibraryStats)
async def library_stats() -> LibraryStats:
    return pipeline.get_stats()


@router.get("/tracks", response_model=TrackListResponse)
async def list_tracks(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> TrackListResponse:
    return pipeline.list_tracks(limit=limit, offset=offset)


@router.get("/tracks/{track_id}", response_model=TrackDetailResponse)
async def track_detail(track_id: str) -> TrackDetailResponse:
    track_uuid = _parse_uuid(track_id)

    try:
        return pipeline.get_track(track_uuid)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/tracks/{track_id}/peaks")
async def track_peaks(
    track_id: str, buckets: int = Query(default=200, ge=16, le=2000)
) -> dict:
    """Downsampled peak envelope for waveform thumbnails."""
    import numpy as np
    import soundfile as sf

    from app.config import settings
    from app.security import AUDIO_SUFFIXES, confined_file

    track_uuid = _parse_uuid(track_id)
    record = pipeline._tracks.get(track_uuid)
    if record is None:
        raise HTTPException(status_code=404, detail="Track not found")
    source = record.original_path or record.metadata.get("source_path")
    if not source:
        raise HTTPException(status_code=404, detail="No audio path")
    path = confined_file(settings.MUSIC_LIBRARY, source, suffixes=AUDIO_SUFFIXES)
    data, sr = sf.read(str(path), always_2d=False)
    if getattr(data, "ndim", 1) > 1:
        data = data.mean(axis=1)
    n = min(buckets, int(data.shape[0]) or 1)
    chunk = data.shape[0] / n
    peaks = []
    for i in range(n):
        sl = data[int(i * chunk) : int((i + 1) * chunk)]
        peaks.append(float(np.max(np.abs(sl))) if sl.size else 0.0)
    duration = float(data.shape[0] / sr) if sr else 0.0
    return {"peaks": peaks, "duration": duration}


@router.delete("/tracks/{track_id}")
async def delete_track(track_id: str) -> Response:
    track_uuid = _parse_uuid(track_id)

    try:
        pipeline.delete_track(track_uuid)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return Response(status_code=204)


@router.post("/tracks/{track_id}/refresh", response_model=JobResponse, status_code=202)
async def refresh_track(track_id: str) -> JobResponse:
    track_uuid = _parse_uuid(track_id)

    payload = ProcessJobRequest(track_id=track_uuid)
    job = pipeline.queue_processing(payload)
    pipeline.touch_track(track_uuid, status="queued")
    return job


@router.get("/tracks/{track_id}/loops", response_model=list[LoopPreview])
async def track_loops(
    track_id: str, bar_length: int | None = Query(default=None, ge=1, le=32)
) -> list[LoopPreview]:
    track_uuid = _parse_uuid(track_id)

    try:
        return pipeline.list_loops(track_uuid, bar_length=bar_length)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/tracks/{track_id}/loops/reslice", response_model=list[LoopPreview])
async def reslice_loops(
    track_id: str, payload: LoopResliceRequest
) -> list[LoopPreview]:
    track_uuid = _parse_uuid(track_id)

    try:
        return await pipeline.reslice_loops(track_uuid, bar_length=payload.bar_length)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/tracks/{track_id}/loops/{loop_id}/audio")
async def loop_audio(track_id: str, loop_id: str) -> FileResponse:
    from app.config import settings
    from app.security import AUDIO_SUFFIXES, confined_file

    track_uuid = _parse_uuid(track_id)

    try:
        path = pipeline.get_loop_audio(track_uuid, loop_id)
    except (KeyError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    path = confined_file(settings.MUSIC_LIBRARY, path, suffixes=AUDIO_SUFFIXES)
    return FileResponse(path, media_type="audio/wav", filename=path.name)


@router.post("/tracks/{track_id}/loops/custom", response_model=LoopPreview)
async def create_custom_loop(track_id: str, payload: CustomLoopRequest) -> LoopPreview:
    track_uuid = _parse_uuid(track_id)

    try:
        return await pipeline.extract_custom_loop(
            track_uuid,
            start_time=payload.start_time,
            end_time=payload.end_time,
            stems=payload.stems,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/tracks/{track_id}/phrases")
async def get_smart_phrases(track_id: str):
    """Get smart phrase suggestions (chorus, drop, intro, outro) for a track."""
    from app.config import settings
    from app.security import AUDIO_SUFFIXES, confined_file

    track_uuid = _parse_uuid(track_id)
    track_record = pipeline._tracks.get(track_uuid)
    if track_record is None:
        raise HTTPException(status_code=404, detail="Track not found")

    source = track_record.metadata.get("source_path") or track_record.original_path
    if source is None:
        raise HTTPException(status_code=404, detail="No audio path")

    audio_path = confined_file(settings.MUSIC_LIBRARY, source, suffixes=AUDIO_SUFFIXES)

    def _make_response(segments: list, record=track_record) -> dict:
        return {
            "phrases": segments,
            "bpm": float(record.bpm or 0) if record else 0,
            "duration": float(record.metadata.get("duration", 0)) if record else 0,
        }

    # Prefer pre-computed allin1 segments stored during ingest analysis
    if track_record and track_record.metadata.get("segments"):
        return _make_response(track_record.metadata["segments"])

    # Fall back: run allin1 on demand
    try:
        from app.services.analysis.mlx_analyzer import analyze_track

        result = analyze_track(audio_path)
        return _make_response(result.get("segments", []))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {e}")


@router.post("/tracks/{track_id}/stems/{stem_name}/midi")
async def stem_to_midi(track_id: str, stem_name: str) -> FileResponse:
    """Convert a separated stem to MIDI using basic-pitch (CoreML / Neural Engine)."""
    from app.config import settings
    from app.security import AUDIO_SUFFIXES, EXPORT_SUFFIXES, confined_file, safe_name

    track_uuid = _parse_uuid(track_id)
    clean_stem = safe_name(stem_name)

    try:
        stem_path = pipeline.get_stem_path(track_uuid, clean_stem)
        stem_path = confined_file(settings.MUSIC_LIBRARY, stem_path, suffixes=AUDIO_SUFFIXES)
    except HTTPException:
        raise
    except (KeyError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    try:
        from basic_pitch.inference import predict

        _, midi_data, _ = predict(str(stem_path))
        out_dir = settings.MUSIC_LIBRARY / "exports" / "midi"
        out_dir.mkdir(parents=True, exist_ok=True)
        midi_name = safe_name(f"{track_uuid}_{clean_stem}.mid")
        midi_path = out_dir / midi_name
        midi_data.write(str(midi_path))
        confined_midi = confined_file(settings.MUSIC_LIBRARY, midi_path, suffixes=EXPORT_SUFFIXES)
        return FileResponse(confined_midi, media_type="audio/midi", filename=confined_midi.name)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"MIDI conversion failed: {exc}",
        )


@router.post("/tracks/{track_id}/extract")
async def surgical_extract(track_id: str, payload: SurgicalExtractRequest) -> FileResponse:
    """SAM Audio text-prompted surgical extraction from a track's audio."""
    import re
    from app.config import settings
    from app.security import AUDIO_SUFFIXES, confined_file, safe_name

    track_uuid = _parse_uuid(track_id)

    record = pipeline._tracks.get(track_uuid)
    if record is None:
        raise HTTPException(status_code=404, detail="Track not found")

    raw_audio_path = record.metadata.get("source_path") or record.original_path
    if raw_audio_path is None:
        raise HTTPException(status_code=404, detail="No audio path for track")
    audio_path = confined_file(settings.MUSIC_LIBRARY, raw_audio_path, suffixes=AUDIO_SUFFIXES)

    try:
        from mlx_audio.sts import SAMAudio, SAMAudioProcessor, save_audio

        processor = SAMAudioProcessor.from_pretrained("facebook/sam-audio-small")
        model = SAMAudio.from_pretrained("facebook/sam-audio-small")

        batch = processor(
            descriptions=[payload.description],
            audios=[str(audio_path)],
        )
        result = model.separate_long(
            audios=batch.audios,
            descriptions=batch.descriptions,
            chunk_seconds=10.0,
            overlap_seconds=3.0,
            anchor_ids=batch.anchor_ids,
            anchor_alignment=batch.anchor_alignment,
            ode_decode_chunk_size=50,
        )

        out_dir = settings.MUSIC_LIBRARY / "exports" / "extracts"
        out_dir.mkdir(parents=True, exist_ok=True)
        label = re.sub(r"[^a-zA-Z0-9_-]", "_", payload.description)[:40].strip("_") or "extract"
        out_name = safe_name(f"{track_uuid}_{label}.wav")
        out_path = out_dir / out_name
        save_audio(result.target[0], str(out_path), sample_rate=model.sample_rate)
        confined_out = confined_file(settings.MUSIC_LIBRARY, out_path, suffixes=AUDIO_SUFFIXES)

        return FileResponse(confined_out, media_type="audio/wav", filename=confined_out.name)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"SAM Audio extraction failed: {exc}",
        )
