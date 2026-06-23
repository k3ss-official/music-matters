"""Pydantic models for the Isolation Workspace feature."""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class EQ5Band(BaseModel):
    """5-band EQ: 80 / 240 / 1200 / 5000 / 12000 Hz, dB gain per band."""
    low_db: float = 0.0
    low_mid_db: float = 0.0
    mid_db: float = 0.0
    high_mid_db: float = 0.0
    high_db: float = 0.0


class ExportSettings(BaseModel):
    loop_length_seconds: float = 4.0
    bpm: float = 120.0
    grid_snap: str = "1_bar"
    format: str = "wav"
    sample_rate: int = 44100
    bit_depth: int = 24


class Substem(BaseModel):
    id: str
    name: str
    file_path: Optional[str] = None
    waveform_peaks: List[float] = Field(default_factory=list)
    selected: bool = False
    solo: bool = False
    muted: bool = False
    gain_db: float = 0.0
    eq_5band: EQ5Band = Field(default_factory=EQ5Band)
    meter_level: float = 0.0
    color: str = "#ffffff"
    is_placeholder: bool = False
    implementation_status: str = "placeholder"


class IsolationSession(BaseModel):
    id: str
    source_track_path: Optional[str] = None
    parent_stem_path: Optional[str] = None
    parent_stem_name: str = "untitled"
    region_start: float = 0.0
    region_end: float = 0.0
    bpm: float = 120.0
    key: Optional[str] = None
    substems: List[Substem] = Field(default_factory=list)
    selected_substem_ids: List[str] = Field(default_factory=list)
    active_eq_target: Optional[str] = None
    audition_mode: Literal["selected_only", "parent_minus_selected", "full_context"] = "full_context"
    export_settings: ExportSettings = Field(default_factory=ExportSettings)
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    source_track_path: Optional[str] = None
    parent_stem_path: Optional[str] = None
    parent_stem_name: str = "untitled"
    region_start: float = 0.0
    region_end: float = 0.0
    bpm: float = 120.0
    key: Optional[str] = None
    export_settings: Optional[ExportSettings] = None


class UpdateSessionRequest(BaseModel):
    parent_stem_path: Optional[str] = None
    parent_stem_name: Optional[str] = None
    region_start: Optional[float] = None
    region_end: Optional[float] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    selected_substem_ids: Optional[List[str]] = None
    active_eq_target: Optional[str] = None
    audition_mode: Optional[Literal["selected_only", "parent_minus_selected", "full_context"]] = None
    export_settings: Optional[ExportSettings] = None


class UpdateSubstemRequest(BaseModel):
    selected: Optional[bool] = None
    solo: Optional[bool] = None
    muted: Optional[bool] = None
    gain_db: Optional[float] = None
    eq_5band: Optional[EQ5Band] = None
    meter_level: Optional[float] = None
