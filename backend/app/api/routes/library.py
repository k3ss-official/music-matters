"""Library browsing endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse

from app.api.schemas import (
    JobResponse,
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
    track_uuid = _parse_uuid(track_id)

    try:
        path = pipeline.get_loop_audio(track_uuid, loop_id)
    except (KeyError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    filename = path.name
    return FileResponse(path, media_type="audio/wav", filename=filename)


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
    from pathlib import Path

    track_uuid = _parse_uuid(track_id)

    try:
        track = pipeline.get_track(track_uuid)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    audio_path = track.metadata.get("source_path") or track.original_path
    if audio_path is None:
        raise HTTPException(status_code=404, detail="No audio path")

    # Convert to string if Path object
    if hasattr(audio_path, "__fspath__"):
        audio_path = audio_path.__fspath__()

    audio_path = Path(audio_path)

    if not audio_path.exists():
        raise HTTPException(
            status_code=404, detail=f"Audio file not found: {audio_path}"
        )

    track_record = pipeline._tracks.get(track_uuid)

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
        import traceback

        raise HTTPException(
            status_code=500,
            detail=f"Analysis error: {str(e)}: {traceback.format_exc()}",
        )


@router.post("/tracks/{track_id}/stems/{stem_name}/midi")
async def stem_to_midi(track_id: str, stem_name: str) -> FileResponse:
    """Convert a separated stem to MIDI using basic-pitch (CoreML / Neural Engine)."""
    import tempfile
    from pathlib import Path

    track_uuid = _parse_uuid(track_id)

    try:
        stem_path = pipeline.get_stem_path(track_uuid, stem_name)
    except (KeyError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    try:
        from basic_pitch.inference import predict
        import pretty_midi

        _, midi_data, _ = predict(str(stem_path))
        out_dir = Path(tempfile.mkdtemp())
        midi_path = out_dir / f"{track_id}_{stem_name}.mid"
        midi_data.write(str(midi_path))
        return FileResponse(midi_path, media_type="audio/midi", filename=midi_path.name)
    except Exception as exc:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"MIDI conversion failed: {str(exc)}: {traceback.format_exc()}",
        )


@router.post("/tracks/{track_id}/extract")
async def surgical_extract(track_id: str, payload: SurgicalExtractRequest) -> FileResponse:
    """SAM Audio text-prompted surgical extraction from a track's audio."""
    import asyncio
    import tempfile
    from pathlib import Path

    track_uuid = _parse_uuid(track_id)

    try:
        track = pipeline.get_track(track_uuid)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    audio_path = track.metadata.get("source_path") or track.original_path
    if audio_path is None:
        raise HTTPException(status_code=404, detail="No audio path for track")
    audio_path = str(audio_path)

    try:
        from mlx_audio.sts import SAMAudio, SAMAudioProcessor, save_audio
        import mlx.core as mx

        processor = SAMAudioProcessor.from_pretrained("facebook/sam-audio-small")
        model = SAMAudio.from_pretrained("facebook/sam-audio-small")

        batch = processor(
            descriptions=[payload.description],
            audios=[audio_path],
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

        out_dir = Path(tempfile.mkdtemp())
        label = payload.description.replace(" ", "_")[:40]
        out_path = out_dir / f"{track_id}_{label}.wav"
        save_audio(result.target[0], str(out_path), sample_rate=model.sample_rate)

        return FileResponse(out_path, media_type="audio/wav", filename=out_path.name)
    except Exception as exc:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"SAM Audio extraction failed: {str(exc)}: {traceback.format_exc()}",
        )
