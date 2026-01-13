"""Ingest endpoints."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional

from app.api.schemas import IngestRequest, IngestResponse
from app.config import settings
from app.services.pipeline import pipeline

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def enqueue_ingest(payload: IngestRequest) -> IngestResponse:
    try:
        return pipeline.queue_ingest(payload)
    except ValueError as exc:  # pragma: no cover - placeholder
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/download", response_model=IngestResponse, status_code=202)
async def download_track_alias(request: dict) -> IngestResponse:
    """Bridge for frontend downloadTrack call."""
    url = request.get("url")
    if not url:
        # If no URL, might be just metadata ingest (placeholder)
        raise HTTPException(status_code=400, detail="URL required for download")
    
    payload = IngestRequest(source=url)
    return pipeline.queue_ingest(payload)


@router.post("/upload", response_model=IngestResponse, status_code=202)
async def upload_and_ingest(
    file: UploadFile = File(...),
    tags: Optional[str] = Form(None),
    collection: Optional[str] = Form(None),
) -> IngestResponse:
    """Upload an audio file and ingest it into the pipeline."""
    try:
        # Save uploaded file to downloads directory
        downloads_dir = settings.resolved_downloads_dir
        downloads_dir.mkdir(parents=True, exist_ok=True)
        
        # Sanitize filename
        safe_filename = "".join(c for c in file.filename or "upload.wav" if c.isalnum() or c in "._- ")
        file_path = downloads_dir / safe_filename
        
        # Write file
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Parse tags
        tag_list = [t.strip() for t in tags.split(",")] if tags else []
        
        # Queue ingestion
        payload = IngestRequest(
            source=str(file_path),
            tags=tag_list,
            collection=collection or "uploads"
        )
        return pipeline.queue_ingest(payload)
        
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
