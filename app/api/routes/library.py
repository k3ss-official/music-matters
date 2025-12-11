"""Library browsing endpoints."""

from __future__ import annotations

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
    try:
        track_uuid = UUID(track_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        return pipeline.get_track(track_uuid)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/tracks/{track_id}/refresh", response_model=JobResponse, status_code=202)
async def refresh_track(track_id: str) -> JobResponse:
    try:
        track_uuid = UUID(track_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    payload = ProcessJobRequest(track_id=track_uuid)
    job = pipeline.queue_processing(payload)
    pipeline.touch_track(track_uuid, status="queued")
    return job


@router.get("/tracks/{track_id}/loops", response_model=list[LoopPreview])
async def track_loops(track_id: str, bar_length: int | None = Query(default=None, ge=1, le=32)) -> list[LoopPreview]:
    try:
        track_uuid = UUID(track_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        return pipeline.list_loops(track_uuid, bar_length=bar_length)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/tracks/{track_id}/loops/reslice", response_model=list[LoopPreview])
async def reslice_loops(track_id: str, payload: LoopResliceRequest) -> list[LoopPreview]:
    try:
        track_uuid = UUID(track_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        return await pipeline.reslice_loops(track_uuid, bar_length=payload.bar_length)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/tracks/{track_id}/loops/{loop_id}/audio")
async def loop_audio(track_id: str, loop_id: str) -> FileResponse:
    try:
        track_uuid = UUID(track_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        path = pipeline.get_loop_audio(track_uuid, loop_id)
    except (KeyError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    filename = path.name
    return FileResponse(path, media_type="audio/wav", filename=filename)
