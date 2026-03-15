"""Ingest endpoints."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional, List
from pydantic import BaseModel as _BaseModel

from app.api.schemas import IngestRequest, IngestResponse, ProcessingOptions
import json
from app.config import settings
from app.services.pipeline import pipeline

router = APIRouter(prefix="/ingest", tags=["ingest"])


class BatchIngestRequest(_BaseModel):
    queries: List[str]
    options: ProcessingOptions = ProcessingOptions()
    collection: Optional[str] = None
    tags: List[str] = []


class BatchIngestResponse(_BaseModel):
    jobs: List[IngestResponse]
    total: int


@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def enqueue_ingest(payload: IngestRequest) -> IngestResponse:
    try:
        return pipeline.queue_ingest(payload)
    except ValueError as exc:  # pragma: no cover - placeholder
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/upload", response_model=IngestResponse, status_code=202)
async def upload_and_ingest(
    file: UploadFile = File(...),
    tags: Optional[str] = Form(None),
    collection: Optional[str] = Form(None),
    options: Optional[str] = Form(None),  # JSON string
) -> IngestResponse:
    """Upload an audio file and ingest it into the pipeline."""
    try:
        # Save uploaded file to downloads directory
        downloads_dir = settings.resolved_downloads_dir
        downloads_dir.mkdir(parents=True, exist_ok=True)

        # Sanitize filename
        safe_filename = "".join(
            c for c in file.filename or "upload.wav" if c.isalnum() or c in "._- "
        )
        file_path = downloads_dir / safe_filename

        # Write file
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Parse tags
        tag_list = [t.strip() for t in tags.split(",")] if tags else []

        # Parse options if provided
        processing_options = ProcessingOptions()
        if options:
            try:
                opts_dict = json.loads(options)
                processing_options = ProcessingOptions(**opts_dict)
            except (json.JSONDecodeError, TypeError):
                # Fallback to default if invalid
                pass

        # Queue ingestion
        payload = IngestRequest(
            source=str(file_path), 
            tags=tag_list, 
            collection=collection or "uploads",
            options=processing_options
        )
        return pipeline.queue_ingest(payload)

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/batch", response_model=BatchIngestResponse, status_code=202)
async def batch_ingest(payload: BatchIngestRequest) -> BatchIngestResponse:
    """Enqueue multiple ingest jobs in one call. Each query is a URL or text search."""
    if not payload.queries:
        raise HTTPException(status_code=400, detail="queries list must not be empty")
    if len(payload.queries) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 queries per batch")

    jobs: List[IngestResponse] = []
    errors: List[str] = []

    for query in payload.queries:
        try:
            req = IngestRequest(
                source=query.strip(),
                tags=payload.tags,
                collection=payload.collection,
                options=payload.options,
            )
            job = pipeline.queue_ingest(req)
            jobs.append(job)
        except Exception as exc:
            errors.append(f"{query!r}: {exc}")

    if not jobs:
        raise HTTPException(
            status_code=500,
            detail=f"All {len(payload.queries)} queries failed: {'; '.join(errors[:3])}",
        )

    return BatchIngestResponse(jobs=jobs, total=len(jobs))
