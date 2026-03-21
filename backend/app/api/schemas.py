"""Pydantic schemas for public API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, HttpUrl


class ProcessingOptions(BaseModel):
    analysis: bool = True
    separation: bool = True
    loop_slicing: bool = True
    mastering: bool = False
    separation_mode: str = "fast"  # "fast" = demucs-mlx | "vocal_quality" = MelBand-Roformer

class IngestRequest(BaseModel):
    source: HttpUrl | str = Field(..., description="URL or local path to ingest")
    tags: List[str] = Field(default_factory=list)
    collection: Optional[str] = Field(default=None, description="Logical grouping for batch jobs")
    options: ProcessingOptions = Field(default_factory=ProcessingOptions)


class IngestResponse(BaseModel):
    job_id: UUID = Field(default_factory=uuid4)
    track_id: UUID = Field(default_factory=uuid4)
    stage: str = Field(default="queued")


class ProcessJobRequest(BaseModel):
    track_id: UUID
    stages: List[str] = Field(default_factory=lambda: ["analysis", "separation", "loop"])
    priority: str = Field(default="normal", pattern="^(low|normal|high)$")
    force: bool = False


class StageProgress(BaseModel):
    id: str
    label: str
    progress: float = Field(ge=0.0, le=1.0)
    status: Literal["pending", "running", "done", "error"] = "pending"
    detail: Optional[str] = None
    eta_seconds: Optional[int] = None


class JobResponse(BaseModel):
    job_id: UUID
    track_id: UUID
    status: Literal["queued", "running", "completed", "failed"]
    current_stage: Optional[str] = None
    progress: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    eta: Optional[datetime] = None
    detail: Optional[str] = None
    stages: List[StageProgress] = Field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


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


class SearchRequest(BaseModel):
    query: str
    collection: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class SearchResult(BaseModel):
    track_id: UUID
    title: str
    artist: Optional[str] = None
    source: str
    status: str
    confidence: float = Field(ge=0.0, le=1.0)


class LoopPreview(BaseModel):
    id: str
    label: str
    start_bar: int
    bar_count: int
    stem: str
    bpm: float
    musical_key: Optional[str] = None
    energy: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    tags: List[str] = Field(default_factory=list)
    file_url: Optional[str] = None


class LoopResliceRequest(BaseModel):
    bar_length: int = Field(ge=1, le=32)


class AgentStatus(BaseModel):
    name: str
    scope: List[str]
    healthy: bool
    last_heartbeat: Optional[datetime] = None
