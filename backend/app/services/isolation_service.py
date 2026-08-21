"""
Isolation Workspace service.

Non-destructive session store for substem splitting, EQ shaping, and export.
All session data is persisted as JSON under:
  <MUSIC_LIBRARY>/Library/<track_slug>/Isolation/<session_id>/session.json

Substems are currently PLACEHOLDER — real DSP (demucs sub-splitting) is a
future step. Every substem carries is_placeholder=True so callers can
gate real processing on it.
"""
from __future__ import annotations

import json
import math
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from app.config import settings
from app.security import AUDIO_SUFFIXES, confined_file, safe_name
from app.services.isolation_models import (
    EQ5Band,
    ExportSettings,
    IsolationSession,
    Substem,
)

# ---------------------------------------------------------------------------
# Deterministic fake waveform peaks — visually plausible without any audio IO
# ---------------------------------------------------------------------------
_SUBSTEM_COLORS = ["#ff3b5c", "#00d4ff", "#8b5cf6", "#fbbf24", "#00ff88"]
_SUBSTEM_NAMES = ["Low End", "Mid Body", "High Transients", "Harmonic", "Ambient"]
_NUM_PEAKS = 200


def _fake_peaks(seed: int, n: int = _NUM_PEAKS) -> List[float]:
    """Deterministic peaks shaped like audio — louder in the middle, quieter edges."""
    peaks = []
    for i in range(n):
        phase = (i + seed * 37) * 0.31
        envelope = math.sin(math.pi * i / n)  # arch shape
        value = abs(math.sin(phase) * 0.5 + math.sin(phase * 2.3) * 0.3 + math.sin(phase * 5.7) * 0.2)
        peaks.append(round(value * envelope, 4))
    return peaks


def _make_placeholder_substems(session_id: str) -> List[Substem]:
    substems = []
    for i in range(5):
        substems.append(
            Substem(
                id=f"{session_id}-sub-{i + 1}",
                name=_SUBSTEM_NAMES[i],
                file_path=None,
                waveform_peaks=_fake_peaks(seed=i),
                selected=False,
                solo=False,
                muted=False,
                gain_db=0.0,
                eq_5band=EQ5Band(),
                meter_level=0.0,
                color=_SUBSTEM_COLORS[i],
                is_placeholder=True,
                implementation_status="placeholder",
            )
        )
    return substems


# ---------------------------------------------------------------------------
# Session storage helpers
# ---------------------------------------------------------------------------

def _session_dir(session_id: str) -> Path:
    return settings.MUSIC_LIBRARY / "Library" / "Isolation" / safe_name(session_id)


def _session_file(session_id: str) -> Path:
    return _session_dir(session_id) / "session.json"


def _save_session(session: IsolationSession) -> None:
    path = _session_file(session.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(session.model_dump_json(indent=2), encoding="utf-8")


def _load_session(session_id: str) -> Optional[IsolationSession]:
    path = _session_file(session_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return IsolationSession.model_validate(data)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# IsolationService
# ---------------------------------------------------------------------------

class IsolationService:
    """Manages isolation sessions with file persistence + in-memory cache."""

    def __init__(self) -> None:
        # In-memory cache for fast access — truth is on disk
        self._cache: Dict[str, IsolationSession] = {}

    # ------------------------------------------------------------------ CRUD

    def create_session(
        self,
        source_track_path: Optional[str] = None,
        parent_stem_path: Optional[str] = None,
        parent_stem_name: str = "untitled",
        region_start: float = 0.0,
        region_end: float = 0.0,
        bpm: float = 120.0,
        key: Optional[str] = None,
        export_settings: Optional[ExportSettings] = None,
    ) -> IsolationSession:
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        session = IsolationSession(
            id=session_id,
            source_track_path=source_track_path,
            parent_stem_path=parent_stem_path,
            parent_stem_name=parent_stem_name,
            region_start=region_start,
            region_end=region_end,
            bpm=bpm,
            key=key,
            substems=[],
            selected_substem_ids=[],
            active_eq_target=None,
            audition_mode="full_context",
            export_settings=export_settings or ExportSettings(bpm=bpm),
            created_at=now,
            updated_at=now,
        )
        _save_session(session)
        self._cache[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[IsolationSession]:
        if session_id in self._cache:
            return self._cache[session_id]
        session = _load_session(session_id)
        if session:
            self._cache[session_id] = session
        return session

    def update_session(self, session_id: str, updates: dict) -> Optional[IsolationSession]:
        session = self.get_session(session_id)
        if session is None:
            return None
        data = session.model_dump()
        for k, v in updates.items():
            if k in data and k not in ("id", "created_at", "substems"):
                data[k] = v
        data["updated_at"] = datetime.now(timezone.utc)
        updated = IsolationSession.model_validate(data)
        self._cache[session_id] = updated
        _save_session(updated)
        return updated

    # ------------------------------------------------------------------ Ops

    def split_substems(self, session_id: str) -> Optional[IsolationSession]:
        """Populate session with 5 placeholder substems.

        Correct DSP sequence (not yet implemented):
          1. extract_region must have already sliced the parent stem at
             [region_start, region_end] → writes session_dir/extracted_region.wav
          2. split_substems runs sub-splitting (e.g. Demucs mdx_extra or a
             frequency-band model) on extracted_region.wav — NOT on the full
             parent stem file.  This keeps processing time proportional to the
             region length, not the whole track.
          3. Each resulting sub-file is stored as session_dir/sub_{i}.wav and
             referenced via Substem.file_path.

        The current implementation returns 5 deterministic placeholder substems
        with fake waveform peaks and file_path=None until DSP is wired.
        """
        session = self.get_session(session_id)
        if session is None:
            return None
        data = session.model_dump()
        data["substems"] = [s.model_dump() for s in _make_placeholder_substems(session_id)]
        data["updated_at"] = datetime.now(timezone.utc)
        updated = IsolationSession.model_validate(data)
        self._cache[session_id] = updated
        _save_session(updated)
        return updated

    def update_substem(
        self, session_id: str, substem_id: str, updates: dict
    ) -> Optional[IsolationSession]:
        session = self.get_session(session_id)
        if session is None:
            return None
        data = session.model_dump()
        allowed = {"selected", "solo", "muted", "gain_db", "eq_5band", "meter_level"}
        found = False
        for sub in data["substems"]:
            if sub["id"] == substem_id:
                for k, v in updates.items():
                    if k in allowed:
                        sub[k] = v
                found = True
                break
        if not found:
            return None
        data["updated_at"] = datetime.now(timezone.utc)
        updated = IsolationSession.model_validate(data)
        self._cache[session_id] = updated
        _save_session(updated)
        return updated

    def preview(self, session_id: str) -> dict:
        """Placeholder preview endpoint — real mixing/audio-process is future."""
        session = self.get_session(session_id)
        if session is None:
            return {"error": "session not found"}
        return {
            "session_id": session_id,
            "status": "placeholder",
            "implementation_status": "placeholder",
            "message": "Audio preview will be rendered in future DSP step",
        }

    def export_loop(self, session_id: str) -> dict:
        """Placeholder export — real render is future DSP step."""
        session = self.get_session(session_id)
        if session is None:
            return {"error": "session not found"}
        selected = [s for s in session.substems if s.selected]
        return {
            "session_id": session_id,
            "status": "placeholder",
            "implementation_status": "placeholder",
            "selected_substems": [s.id for s in selected],
            "export_settings": session.export_settings.model_dump(),
            "output_path": None,
            "message": "Export will render mixed WAV in future DSP step",
        }

    def extract_region(self, session_id: str) -> dict:
        """Slice the parent stem at [region_start, region_end].

        When parent_stem_path is set and readable, write
        session_dir/extracted_region.wav. Otherwise keep the placeholder
        response so sessions created without a parent still work.
        """
        session = self.get_session(session_id)
        if session is None:
            return {"error": "session not found"}

        parent = session.parent_stem_path
        if not parent:
            return {
                "session_id": session_id,
                "status": "placeholder",
                "implementation_status": "placeholder",
                "region_start": session.region_start,
                "region_end": session.region_end,
                "message": "Region extraction will slice parent stem in future DSP step",
            }

        try:
            src = confined_file(settings.MUSIC_LIBRARY, parent, suffixes=AUDIO_SUFFIXES)
        except Exception:
            return {
                "session_id": session_id,
                "status": "placeholder",
                "implementation_status": "placeholder",
                "region_start": session.region_start,
                "region_end": session.region_end,
                "message": "Parent stem is not a readable library file",
            }

        import numpy as np
        import soundfile as sf

        info = sf.info(str(src))
        sr = int(info.samplerate)
        start = max(0, int(float(session.region_start) * sr))
        end = max(start + 1, int(float(session.region_end) * sr))
        data, _ = sf.read(str(src), start=start, stop=end, always_2d=False)
        if getattr(data, "size", 0) == 0:
            data = np.zeros(sr, dtype="float32")

        out = _session_dir(session_id) / "extracted_region.wav"
        out.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(out), data, sr)
        return {
            "session_id": session_id,
            "status": "extracted",
            "implementation_status": "extracted",
            "region_start": session.region_start,
            "region_end": session.region_end,
            "output_path": str(out),
            "message": "Region sliced from parent stem",
        }


# Singleton
isolation_service = IsolationService()
