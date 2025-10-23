"""Library browsing endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.api.schemas import JobResponse, ProcessJobRequest, TrackDetailResponse, TrackListResponse
from app.services.pipeline import pipeline

router = APIRouter()


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
