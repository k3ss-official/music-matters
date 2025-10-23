"""Pipeline orchestration stubs.

These services provide a clear interface for the FastAPI layer while
back-end workers are implemented.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Dict
from uuid import UUID, uuid4

from app.api import schemas
from app.core.settings import settings


class PipelineOrchestrator:
    """In-memory placeholder orchestrator.

    A real implementation would enqueue jobs for a worker pool and
    persist metadata to SQLite. For now, this captures requested jobs and
    exposes read-only views so API clients can integrate while the heavy
    lifting is built out.
    """

    def __init__(self) -> None:
        self._jobs: Dict[UUID, schemas.JobResponse] = {}
        self._tracks: Dict[UUID, schemas.TrackDetailResponse] = {}

    # ------------------------------------------------------------------
    # Job management
    # ------------------------------------------------------------------
    def queue_ingest(self, payload: schemas.IngestRequest) -> schemas.IngestResponse:
        job_id = uuid4()
        track_id = uuid4()
        response = schemas.IngestResponse(job_id=job_id, track_id=track_id, stage="queued")
        self._jobs[job_id] = schemas.JobResponse(
            job_id=job_id,
            status="queued",
            current_stage="ingest",
            progress=0.0,
            detail=f"Queued ingest for {payload.source}",
        )
        self._tracks[track_id] = schemas.TrackDetailResponse(
            track_id=track_id,
            title=self._derive_title(payload.source),
            artist=None,
            status="ingest_queued",
            bpm=None,
            musical_key=None,
            created_at=datetime.now(timezone.utc),
            metadata={"tags": payload.tags, "collection": payload.collection},
        )
        return response

    def queue_processing(self, payload: schemas.ProcessJobRequest) -> schemas.JobResponse:
        job_id = uuid4()
        job = schemas.JobResponse(
            job_id=job_id,
            status="queued",
            current_stage=(payload.stages[0] if payload.stages else "analysis"),
            progress=0.0,
            detail=f"Stages pending: {', '.join(payload.stages)}",
        )
        self._jobs[job_id] = job
        return job

    def get_job(self, job_id: UUID) -> schemas.JobResponse:
        job = self._jobs.get(job_id)
        if job is None:
            raise KeyError(f"Job {job_id} not found")
        return job

    # ------------------------------------------------------------------
    # Library views
    # ------------------------------------------------------------------
    def list_tracks(self, limit: int = 50, offset: int = 0) -> schemas.TrackListResponse:
        items = list(self._tracks.values())
        page = items[offset : offset + limit]
        return schemas.TrackListResponse(items=page, total=len(items))

    def get_track(self, track_id: UUID) -> schemas.TrackDetailResponse:
        track = self._tracks.get(track_id)
        if track is None:
            raise KeyError(f"Track {track_id} not registered")
        return track

    def touch_track(self, track_id: UUID, status: str) -> None:
        record = self._tracks.get(track_id)
        if record is None:
            record = schemas.TrackDetailResponse(
                track_id=track_id,
                title=f"Track {track_id}",
                artist=None,
                status=status,
                bpm=None,
                musical_key=None,
                created_at=datetime.now(timezone.utc),
            )
        else:
            record = record.model_copy(update={"status": status})
        self._tracks[track_id] = record

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _derive_title(self, source: str) -> str:
        if "://" in source:
            fragment = source.rstrip("/").split("/")[-1]
            return fragment or "untitled"
        return Path(source).stem or "untitled"


pipeline = PipelineOrchestrator()
