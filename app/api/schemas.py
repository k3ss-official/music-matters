"""Pydantic schemas for public API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, HttpUrl


class IngestRequest(BaseModel):
    source: HttpUrl | str = Field(..., description="URL or local path to ingest")
    tags: List[str] = Field(default_factory=list)
    collection: Optional[str] = Field(default=None, description="Logical grouping for batch jobs")


class IngestResponse(BaseModel):
    job_id: UUID = Field(default_factory=uuid4)
    track_id: UUID = Field(default_factory=uuid4)
    stage: str = Field(default="queued")


class ProcessJobRequest(BaseModel):
    track_id: UUID
    stages: List[str] = Field(default_factory=lambda: ["analysis", "separation", "loop"])
    priority: str = Field(default="normal", pattern="^(low|normal|high)$")
    force: bool = False


class JobResponse(BaseModel):
    job_id: UUID
    status: str
    current_stage: Optional[str] = None
    progress: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    eta: Optional[datetime] = None
    detail: Optional[str] = None


class TrackSummary(BaseModel):
    track_id: UUID
    title: str
    artist: Optional[str] = None
    status: str
    bpm: Optional[float] = None
    musical_key: Optional[str] = None
    created_at: datetime


class TrackListResponse(BaseModel):
    items: List[TrackSummary]
    total: int


class TrackDetailResponse(TrackSummary):
    metadata: Dict[str, Any] = Field(default_factory=dict)
    stems: List[str] = Field(default_factory=list)
    loops: List[str] = Field(default_factory=list)
    provenance: Dict[str, Any] = Field(default_factory=dict)


class AgentStatus(BaseModel):
    name: str
    scope: List[str]
    healthy: bool
    last_heartbeat: Optional[datetime] = None
