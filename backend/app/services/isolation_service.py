"""
Isolation Workspace service.

Non-destructive session store for substem splitting, EQ shaping, and export.
All session data is persisted as JSON under:
  <MUSIC_LIBRARY>/Library/Isolation/<session_id>/session.json

DSP sequence:
  extract_region → session_dir/extracted_region.wav
  split_substems  → 5 FFT frequency-band WAVs (not the full parent stem)
  export_loop     → mix selected substems to session_dir/export.wav
"""
from __future__ import annotations

import json
import math
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import soundfile as sf

from app.config import settings
from app.security import AUDIO_SUFFIXES, confined_file, safe_name
from app.services.isolation_models import (
    EQ5Band,
    ExportSettings,
    IsolationSession,
    Substem,
)

_SUBSTEM_COLORS = ["#ff3b5c", "#00d4ff", "#8b5cf6", "#fbbf24", "#00ff88"]
_SUBSTEM_NAMES = ["Low End", "Mid Body", "High Transients", "Harmonic", "Ambient"]
# (name, lo_hz, hi_hz) — last band goes to Nyquist in practice
_BANDS: List[Tuple[str, float, float]] = [
    ("Low End", 20.0, 150.0),
    ("Mid Body", 150.0, 600.0),
    ("Harmonic", 600.0, 2500.0),
    ("High Transients", 2500.0, 8000.0),
    ("Ambient", 8000.0, 22000.0),
]
_NUM_PEAKS = 200


def _fake_peaks(seed: int, n: int = _NUM_PEAKS) -> List[float]:
    """Deterministic peaks shaped like audio — louder in the middle, quieter edges."""
    peaks = []
    for i in range(n):
        phase = (i + seed * 37) * 0.31
        envelope = math.sin(math.pi * i / n)
        value = abs(math.sin(phase) * 0.5 + math.sin(phase * 2.3) * 0.3 + math.sin(phase * 5.7) * 0.2)
        peaks.append(round(value * envelope, 4))
    return peaks


def _waveform_peaks(data: np.ndarray, n: int = _NUM_PEAKS) -> List[float]:
    if getattr(data, "ndim", 1) > 1:
        data = data.mean(axis=1)
    if data.size == 0:
        return [0.0] * n
    chunk = data.shape[0] / n
    peaks = []
    for i in range(n):
        sl = data[int(i * chunk) : int((i + 1) * chunk)]
        peaks.append(float(np.max(np.abs(sl))) if sl.size else 0.0)
    mx = max(peaks) or 1.0
    return [round(p / mx, 4) for p in peaks]


def _fft_band(data: np.ndarray, sr: int, lo: float, hi: float) -> np.ndarray:
    spec = np.fft.rfft(data, axis=0)
    freqs = np.fft.rfftfreq(data.shape[0], d=1.0 / sr)
    mask = (freqs >= lo) & (freqs < hi)
    if data.ndim == 1:
        spec = spec * mask
    else:
        spec = spec * mask[:, None]
    out = np.fft.irfft(spec, n=data.shape[0], axis=0)
    return np.asarray(out, dtype=np.float32)


def _apply_eq(data: np.ndarray, sr: int, eq: EQ5Band) -> np.ndarray:
    """Crude 5-band FFT gain: 80 / 240 / 1200 / 5000 / 12000 Hz."""
    centres = [80.0, 240.0, 1200.0, 5000.0, 12000.0]
    gains_db = [eq.low_db, eq.low_mid_db, eq.mid_db, eq.high_mid_db, eq.high_db]
    if all(abs(g) < 0.01 for g in gains_db):
        return data
    spec = np.fft.rfft(data, axis=0)
    freqs = np.fft.rfftfreq(data.shape[0], d=1.0 / sr)
    lin = np.ones_like(freqs)
    edges = [0.0] + [(centres[i] + centres[i + 1]) / 2 for i in range(len(centres) - 1)] + [freqs[-1] + 1]
    for i, gain in enumerate(gains_db):
        band = (freqs >= edges[i]) & (freqs < edges[i + 1])
        lin[band] *= float(10 ** (gain / 20.0))
    if data.ndim == 1:
        spec = spec * lin
    else:
        spec = spec * lin[:, None]
    out = np.fft.irfft(spec, n=data.shape[0], axis=0)
    return np.asarray(out, dtype=np.float32)


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


def _mix_substems(session: IsolationSession, *, audition: bool = False) -> Optional[Tuple[np.ndarray, int]]:
    chosen = [s for s in session.substems if s.file_path]
    if not chosen:
        return None
    if audition:
        mode = session.audition_mode
        if mode == "selected_only":
            selected = [s for s in chosen if s.selected]
            chosen = selected or chosen
        elif mode == "parent_minus_selected":
            chosen = [s for s in chosen if not s.selected] or chosen
    any_solo = any(s.solo for s in chosen)
    mix = None
    sr = 44100
    for stem in chosen:
        if any_solo and not stem.solo:
            continue
        if stem.muted and not stem.solo:
            continue
        path = Path(stem.file_path)
        if not path.is_file():
            continue
        data, sr = sf.read(str(path), always_2d=False)
        data = np.asarray(data, dtype=np.float32)
        data = _apply_eq(data, int(sr), stem.eq_5band)
        gain = float(10 ** (stem.gain_db / 20.0))
        data = data * gain
        mix = data if mix is None else mix + data
    if mix is None:
        return None
    peak = float(np.max(np.abs(mix))) if mix.size else 0.0
    if peak > 1.0:
        mix = mix / peak
    return mix, int(sr)


class IsolationService:
    """Manages isolation sessions with file persistence + in-memory cache."""

    def __init__(self) -> None:
        self._cache: Dict[str, IsolationSession] = {}

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

    def split_substems(self, session_id: str) -> Optional[IsolationSession]:
        """Split extracted_region.wav (or extract first) into 5 frequency-band substems.

        Without a parent stem / extracted region, keep the original placeholder
        substems so sessions created in isolation tests still pass.
        """
        session = self.get_session(session_id)
        if session is None:
            return None

        region = _session_dir(session_id) / "extracted_region.wav"
        if not region.is_file() and session.parent_stem_path:
            self.extract_region(session_id)
            session = self.get_session(session_id) or session

        if not region.is_file():
            data = session.model_dump()
            data["substems"] = [s.model_dump() for s in _make_placeholder_substems(session_id)]
            data["updated_at"] = datetime.now(timezone.utc)
            updated = IsolationSession.model_validate(data)
            self._cache[session_id] = updated
            _save_session(updated)
            return updated

        audio, sr = sf.read(str(region), always_2d=False)
        audio = np.asarray(audio, dtype=np.float32)
        nyq = sr / 2.0
        substems: List[Substem] = []
        out_dir = _session_dir(session_id)
        for i, (name, lo, hi) in enumerate(_BANDS):
            band = _fft_band(audio, int(sr), lo, min(hi, nyq))
            path = out_dir / f"sub_{i + 1}.wav"
            sf.write(str(path), band, int(sr))
            substems.append(
                Substem(
                    id=f"{session_id}-sub-{i + 1}",
                    name=name,
                    file_path=str(path),
                    waveform_peaks=_waveform_peaks(band),
                    selected=False,
                    solo=False,
                    muted=False,
                    gain_db=0.0,
                    eq_5band=EQ5Band(),
                    meter_level=0.0,
                    color=_SUBSTEM_COLORS[i],
                    is_placeholder=False,
                    implementation_status="extracted",
                )
            )
        data = session.model_dump()
        data["substems"] = [s.model_dump() for s in substems]
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
        session = self.get_session(session_id)
        if session is None:
            return {"error": "session not found"}
        mixed = _mix_substems(session, audition=True)
        if mixed is None:
            return {
                "session_id": session_id,
                "status": "placeholder",
                "implementation_status": "placeholder",
                "message": "Split substems first to preview a mix",
            }
        audio, sr = mixed
        out = _session_dir(session_id) / "preview.wav"
        sf.write(str(out), audio, sr)
        return {
            "session_id": session_id,
            "status": "mixed",
            "implementation_status": "extracted",
            "output_path": str(out),
            "message": "Preview mix rendered",
        }

    def export_loop(self, session_id: str) -> dict:
        session = self.get_session(session_id)
        if session is None:
            return {"error": "session not found"}
        selected = [s for s in session.substems if s.selected]
        mixed = _mix_substems(session, audition=False)
        if mixed is None:
            return {
                "session_id": session_id,
                "status": "placeholder",
                "implementation_status": "placeholder",
                "selected_substems": [s.id for s in selected],
                "export_settings": session.export_settings.model_dump(),
                "output_path": None,
                "message": "Split substems first — nothing to export yet",
            }
        audio, sr = mixed
        # If the user picked specific rows, remix just those (already handled if
        # they are selected; if none selected, mix all unmuted).
        if selected:
            session_sel = session.model_copy(deep=True)
            for s in session_sel.substems:
                s.muted = not s.selected
            remixed = _mix_substems(session_sel, audition=False)
            if remixed is not None:
                audio, sr = remixed
        out = _session_dir(session_id) / "export.wav"
        sf.write(str(out), audio, sr)
        return {
            "session_id": session_id,
            "status": "exported",
            "implementation_status": "extracted",
            "selected_substems": [s.id for s in selected],
            "export_settings": session.export_settings.model_dump(),
            "output_path": str(out),
            "message": f"Exported {out.name}",
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


isolation_service = IsolationService()
