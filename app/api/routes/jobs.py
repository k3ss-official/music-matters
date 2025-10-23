"""Job orchestration endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.api.schemas import JobResponse, ProcessJobRequest
from app.services.pipeline import pipeline

router = APIRouter()


@router.post("/process", response_model=JobResponse, status_code=202)
async def enqueue_processing(payload: ProcessJobRequest) -> JobResponse:
    job = pipeline.queue_processing(payload)
    pipeline.touch_track(payload.track_id, status="pending")
    return job


@router.get("/{job_id}", response_model=JobResponse)
async def job_status(job_id: str) -> JobResponse:
    try:
        job_uuid = UUID(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        return pipeline.get_job(job_uuid)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
