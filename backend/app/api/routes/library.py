"""Library browsing endpoints."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
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
from app.services.pipeline import pipeline

router = APIRouter()





@router.get("", response_model=TrackListResponse)
async def list_tracks(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> TrackListResponse:
    return pipeline.list_tracks(limit=limit, offset=offset)


@router.get("/{track_id}", response_model=TrackDetailResponse)
async def track_detail(track_id: str) -> TrackDetailResponse:
    try:
        track_uuid = UUID(track_id)
        return pipeline.get_track(track_uuid)
    except ValueError:
        # Try to find by index/name if not UUID (frontend compatibility)
        for record in pipeline._tracks.values():
            if record.slug == track_id:
                return record.to_detail()
        raise HTTPException(status_code=404, detail="Track not found")


@router.post("/{track_id}/refresh", response_model=JobResponse, status_code=202)
async def refresh_track(track_id: str) -> JobResponse:
    try:
        track_uuid = UUID(track_id)
    except ValueError:
        # Simplified: refresh usually needs ID
        raise HTTPException(status_code=400, detail="UUID required for refresh")

    payload = ProcessJobRequest(track_id=track_uuid)
    job = pipeline.queue_processing(payload)
    pipeline.touch_track(track_uuid, status="queued")
    return job


@router.get("/{track_id}/analyze")
async def analyze_track_by_id(track_id: str):
    """Bridge endpoint for frontend analyze calls."""
    try:
        # Check if it's a UUID or slug
        try:
            track_uuid = UUID(track_id)
            record = pipeline._tracks.get(track_uuid)
        except ValueError:
            record = None
            for r in pipeline._tracks.values():
                if r.slug == track_id:
                    record = r
                    break
        
        if not record:
            raise HTTPException(status_code=404, detail="Track not found")
        
        if not record.original_path or not Path(record.original_path).exists():
             raise HTTPException(status_code=404, detail="Audio file missing")

        from app.services.analysis.audio_analyzer import get_audio_analyzer
        analyzer = get_audio_analyzer()
        analysis_result = analyzer.analyze(record.original_path)
        
        # Format for frontend expectation in App.tsx handleTrackSelected
        return {
            "audioUrl": f"/audio/{record.slug}{Path(record.original_path).suffix}",
            "waveformData": analysis_result.waveform_peaks,
            "beats": [p['start_time'] for p in analysis_result.best_sample_points],
            "downbeats": [],
            "duration": analysis_result.duration,
            "bpm": analysis_result.bpm,
            "key": analysis_result.key,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{track_id}/loops", response_model=list[LoopPreview])
async def track_loops(track_id: str, bar_length: int | None = Query(default=None, ge=1, le=32)) -> list[LoopPreview]:
    try:
        track_uuid = UUID(track_id)
        return pipeline.list_loops(track_uuid, bar_length=bar_length)
    except ValueError:
        raise HTTPException(status_code=404, detail="Track not found")


@router.post("/{track_id}/loops/reslice", response_model=list[LoopPreview])
async def reslice_loops(track_id: str, payload: LoopResliceRequest) -> list[LoopPreview]:
    try:
        track_uuid = UUID(track_id)
        return await pipeline.reslice_loops(track_uuid, bar_length=payload.bar_length)
    except ValueError:
        raise HTTPException(status_code=400, detail="UUID required")


@router.get("/{track_id}/loops/{loop_id}/audio")
async def loop_audio(track_id: str, loop_id: str) -> FileResponse:
    try:
        track_uuid = UUID(track_id)
        path = pipeline.get_loop_audio(track_uuid, loop_id)
        return FileResponse(path, media_type="audio/wav", filename=path.name)
    except (ValueError, KeyError, FileNotFoundError):
        raise HTTPException(status_code=404, detail="Loop audio not found")
