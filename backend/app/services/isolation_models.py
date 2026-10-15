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


class EQ8Band(BaseModel):
    """8-channel single graphic EQ: 31 / 63 / 125 / 250 / 500 / 1k / 4k / 12k Hz, dB gain per band."""
    hz_31: float = 0.0
    hz_63: float = 0.0
    hz_125: float = 0.0
    hz_250: float = 0.0
    hz_500: float = 0.0
    hz_1k: float = 0.0
    hz_4k: float = 0.0
    hz_12k: float = 0.0


class ExportSettings(BaseModel):
    loop_length_seconds: float = 4.0
    bpm: float = 120.0
    grid_snap: str = "1_bar"
    format: str = "wav"
    sample_rate: int = 44100
    bit_depth: int = 24
    post_production: bool = False


class Substem(BaseModel):
    id: str
    name: str
    file_path: Optional[str] = None
    waveform_peaks: List[float] = Field(default_factory=list)
    selected: bool = False
    solo: bool = False
    muted: bool = False
    gain_db: float = 0.0
    gain_left_db: float = 0.0
    gain_right_db: float = 0.0
    kill_low: bool = False
    kill_mid: bool = False
    kill_high: bool = False
    eq_5band: EQ5Band = Field(default_factory=EQ5Band)
    eq_8band: EQ8Band = Field(default_factory=EQ8Band)
    meter_level: float = 0.0
    color: str = "#ffffff"
    is_placeholder: bool = False
    implementation_status: str = "placeholder"


class IsolationSession(BaseModel):
    id: str
    source_track_id: Optional[str] = None
    source_track_path: Optional[str] = None
    parent_stem_path: Optional[str] = None
    parent_stem_name: str = "untitled"
    available_stems: List[str] = Field(default_factory=list)
    parent_waveform_peaks: List[float] = Field(default_factory=list)
    parent_duration: float = 0.0
    region_start: float = 0.0
    region_end: float = 0.0
    bpm: float = 120.0
    key: Optional[str] = None
    substems: List[Substem] = Field(default_factory=list)
    selected_substem_ids: List[str] = Field(default_factory=list)
    active_eq_target: Optional[str] = None
    eq_target_ids: List[str] = Field(default_factory=list)
    master_eq_8band: EQ8Band = Field(default_factory=EQ8Band)
    master_gain_left_db: float = 0.0
    master_gain_right_db: float = 0.0
    master_kill_low: bool = False
    master_kill_mid: bool = False
    master_kill_high: bool = False
    post_production: bool = False
    audition_mode: Literal["selected_only", "parent_minus_selected", "full_context"] = "full_context"
    export_settings: ExportSettings = Field(default_factory=ExportSettings)
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    source_track_id: Optional[str] = None
    source_track_path: Optional[str] = None
    parent_stem_path: Optional[str] = None
    parent_stem_name: str = "untitled"
    region_start: float = 0.0
    region_end: float = 0.0
    bpm: float = 120.0
    key: Optional[str] = None
    export_settings: Optional[ExportSettings] = None


class UpdateExportSettingsRequest(BaseModel):
    loop_length_seconds: Optional[float] = None
    bpm: Optional[float] = None
    grid_snap: Optional[str] = None
    format: Optional[str] = None
    sample_rate: Optional[int] = None
    bit_depth: Optional[int] = None
    post_production: Optional[bool] = None


class UpdateSessionRequest(BaseModel):
    parent_stem_path: Optional[str] = None
    parent_stem_name: Optional[str] = None
    region_start: Optional[float] = None
    region_end: Optional[float] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    selected_substem_ids: Optional[List[str]] = None
    active_eq_target: Optional[str] = None
    eq_target_ids: Optional[List[str]] = None
    master_eq_8band: Optional[EQ8Band] = None
    master_gain_left_db: Optional[float] = None
    master_gain_right_db: Optional[float] = None
    master_kill_low: Optional[bool] = None
    master_kill_mid: Optional[bool] = None
    master_kill_high: Optional[bool] = None
    post_production: Optional[bool] = None
    audition_mode: Optional[Literal["selected_only", "parent_minus_selected", "full_context"]] = None
    export_settings: Optional[UpdateExportSettingsRequest] = None


class UpdateSubstemRequest(BaseModel):
    selected: Optional[bool] = None
    solo: Optional[bool] = None
    muted: Optional[bool] = None
    gain_db: Optional[float] = None
    gain_left_db: Optional[float] = None
    gain_right_db: Optional[float] = None
    kill_low: Optional[bool] = None
    kill_mid: Optional[bool] = None
    kill_high: Optional[bool] = None
    eq_5band: Optional[EQ5Band] = None
    eq_8band: Optional[EQ8Band] = None
    meter_level: Optional[float] = None


class IsolateElementRequest(BaseModel):
    element: str  # kick | snare | hihat | bass | vocal | melody | synth | custom prompt
    assign_to_eq: bool = True


class SaveCompleteBundleRequest(BaseModel):
    label: Optional[str] = None
    save_isolated_sound: bool = True
    save_complete_loop: bool = True
    save_six_stems: bool = True
    post_production: Optional[bool] = None
