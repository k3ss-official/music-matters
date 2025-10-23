"""Ingest endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.schemas import IngestRequest, IngestResponse
from app.services.pipeline import pipeline

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def enqueue_ingest(payload: IngestRequest) -> IngestResponse:
    try:
        return pipeline.queue_ingest(payload)
    except ValueError as exc:  # pragma: no cover - placeholder
        raise HTTPException(status_code=400, detail=str(exc))
