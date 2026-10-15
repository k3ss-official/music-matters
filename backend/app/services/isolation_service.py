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


def _inspect_parent_stem(parent_path: Optional[str], n_peaks: int = 200) -> Tuple[List[float], float]:
    if not parent_path:
        return [], 0.0
    try:
        src = confined_file(settings.MUSIC_LIBRARY, parent_path, suffixes=AUDIO_SUFFIXES)
        with sf.SoundFile(str(src)) as f:
            total = len(f)
            sr = f.samplerate
            if total == 0 or sr <= 0:
                return [0.0] * n_peaks, 0.0
            dur = float(total / sr)
            step = max(1, total // n_peaks)
            read_frames = min(step, 4096)
            peaks: List[float] = []
            for i in range(n_peaks):
                start = min(i * step, max(0, total - 1))
                f.seek(start)
                chunk = f.read(read_frames, dtype="float32", always_2d=False)
                peaks.append(float(np.max(np.abs(chunk))) if len(chunk) else 0.0)
            max_p = max(peaks) if peaks else 0.0
            if max_p > 0:
                peaks = [round(p / max_p, 4) for p in peaks]
            return peaks, round(dur, 4)
    except Exception:
        return [], 0.0


class IsolationService:
    """Manages isolation sessions with file persistence + in-memory cache."""

    def __init__(self) -> None:
        self._cache: Dict[str, IsolationSession] = {}

    def create_session(
        self,
        source_track_id: Optional[str] = None,
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
        available_stems: List[str] = []

        # Allow source_track_id (or a track UUID passed in source_track_path) to hydrate from pipeline
        candidate_tid = source_track_id or source_track_path
        if candidate_tid:
            try:
                from uuid import UUID as _UUID
                from app.services.pipeline import pipeline

                track_uuid = _UUID(str(candidate_tid))
                record = pipeline._tracks.get(track_uuid)
                if record is not None:
                    source_track_id = str(track_uuid)
                    track_audio = record.original_path or record.metadata.get("source_path")
                    if track_audio:
                        source_track_path = str(track_audio)
                    available_stems = [Path(s).stem for s in (record.stems or [])]
                    if record.bpm and bpm == 120.0:
                        bpm = float(record.bpm)
                    if key is None and record.musical_key:
                        key = record.musical_key
                    if not parent_stem_path:
                        priority = ["drums", "bass", "vocals", "guitar", "piano", "other"]
                        chosen_stem: Optional[str] = None
                        if parent_stem_name in available_stems:
                            chosen_stem = parent_stem_name
                        elif available_stems:
                            chosen_stem = next(
                                (s for s in priority if s in available_stems),
                                available_stems[0],
                            )
                        if chosen_stem:
                            try:
                                resolved_stem = pipeline.get_stem_path(track_uuid, chosen_stem)
                                parent_stem_path = str(resolved_stem)
                                parent_stem_name = chosen_stem
                            except Exception:
                                pass
                        if not parent_stem_path and source_track_path:
                            parent_stem_path = source_track_path
            except (ValueError, TypeError):
                pass

        parent_peaks, parent_dur = _inspect_parent_stem(parent_stem_path)
        if parent_dur > 0 and region_end <= region_start:
            region_start = 0.0
            four_bars = (60.0 / max(bpm, 1.0)) * 16.0
            region_end = round(min(parent_dur, max(1.0, four_bars)), 3)

        default_loop_len = round(region_end - region_start, 3) if region_end > region_start else 4.0
        session = IsolationSession(
            id=session_id,
            source_track_id=source_track_id,
            source_track_path=source_track_path,
            parent_stem_path=parent_stem_path,
            parent_stem_name=parent_stem_name,
            available_stems=available_stems,
            parent_waveform_peaks=parent_peaks,
            parent_duration=parent_dur,
            region_start=region_start,
            region_end=region_end,
            bpm=bpm,
            key=key,
            substems=[],
            selected_substem_ids=[],
            active_eq_target=None,
            audition_mode="full_context",
            export_settings=export_settings
            or ExportSettings(bpm=bpm, loop_length_seconds=default_loop_len),
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
        old_parent = data.get("parent_stem_path")
        old_start = data.get("region_start")
        old_end = data.get("region_end")

        for k, v in updates.items():
            if k == "export_settings" and isinstance(v, dict):
                merged_es = dict(data.get("export_settings") or {})
                for ek, ev in v.items():
                    if ev is not None:
                        merged_es[ek] = ev
                data["export_settings"] = merged_es
            elif k in data and k not in ("id", "created_at", "substems"):
                data[k] = v

        if (
            "parent_stem_name" in updates
            and "parent_stem_path" not in updates
            and data.get("source_track_id")
        ):
            try:
                from uuid import UUID as _UUID
                from app.services.pipeline import pipeline

                stem_path = pipeline.get_stem_path(
                    _UUID(str(data["source_track_id"])), str(updates["parent_stem_name"])
                )
                data["parent_stem_path"] = str(stem_path)
            except Exception:
                pass

        parent_changed = data.get("parent_stem_path") != old_parent
        region_changed = data.get("region_start") != old_start or data.get("region_end") != old_end
        if parent_changed:
            peaks, dur = _inspect_parent_stem(data.get("parent_stem_path"))
            data["parent_waveform_peaks"] = peaks
            data["parent_duration"] = dur
        if parent_changed or region_changed:
            sdir = _session_dir(session_id)
            (sdir / "extracted_region.wav").unlink(missing_ok=True)
            (sdir / "preview.wav").unlink(missing_ok=True)
            for stale_sub in sdir.glob("sub_*.wav"):
                stale_sub.unlink(missing_ok=True)
            data["substems"] = []
            data["selected_substem_ids"] = []

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

        es = session.export_settings
        fmt = (es.format or "wav").lower()
        if fmt not in {"wav", "flac", "aiff"}:
            fmt = "wav"
        target_sr = int(es.sample_rate or sr)
        if target_sr > 0 and target_sr != sr and audio.size > 0:
            from scipy.signal import resample_poly

            g = math.gcd(target_sr, sr)
            audio = np.asarray(
                resample_poly(audio, target_sr // g, sr // g, axis=0),
                dtype=np.float32,
            )
            sr = target_sr

        # Apply export_settings loop_length_seconds and grid_snap
        cur_sec = float(audio.shape[0] / sr) if sr > 0 else 0.0
        target_sec = (
            float(es.loop_length_seconds)
            if (es.loop_length_seconds and es.loop_length_seconds > 0)
            else cur_sec
        )
        bpm_val = float(es.bpm or session.bpm or 120.0)
        if es.grid_snap in {"1_bar", "2_bars", "4_bars"} and bpm_val > 0 and target_sec > 0:
            bars = {"1_bar": 1, "2_bars": 2, "4_bars": 4}[es.grid_snap]
            snap_unit = (60.0 / bpm_val) * 4.0 * bars
            target_sec = max(snap_unit, round(target_sec / snap_unit) * snap_unit)

        if target_sec > 0 and sr > 0 and audio.size > 0:
            target_frames = max(1, int(round(target_sec * sr)))
            if audio.shape[0] > target_frames:
                audio = audio[:target_frames]
            elif audio.shape[0] < target_frames:
                pad_len = target_frames - audio.shape[0]
                pad_spec = ((0, pad_len),) + ((0, 0),) * (audio.ndim - 1)
                audio = np.pad(audio, pad_spec)

        bits = int(es.bit_depth or 24)
        if fmt == "flac":
            subtype = "PCM_16" if bits == 16 else "PCM_24"
        else:
            subtype = "PCM_16" if bits == 16 else ("FLOAT" if bits == 32 else "PCM_24")

        out = _session_dir(session_id) / f"export.{fmt}"
        sf.write(str(out), audio, sr, subtype=subtype)
        return {
            "session_id": session_id,
            "status": "exported",
            "implementation_status": "extracted",
            "selected_substems": [s.id for s in selected],
            "export_settings": session.export_settings.model_dump(),
            "output_path": str(out),
            "message": f"Exported {out.name}",
        }

    def get_audio_path(self, session_id: str, target: str) -> Path:
        session = self.get_session(session_id)
        if session is None:
            raise FileNotFoundError(f"Session {session_id!r} not found")
        sdir = _session_dir(session_id)
        if target == "parent":
            if not session.parent_stem_path:
                raise FileNotFoundError("No parent stem configured")
            return confined_file(settings.MUSIC_LIBRARY, session.parent_stem_path, suffixes=AUDIO_SUFFIXES)
        if target == "region":
            return confined_file(settings.MUSIC_LIBRARY, sdir / "extracted_region.wav", suffixes=AUDIO_SUFFIXES)
        if target == "preview":
            return confined_file(settings.MUSIC_LIBRARY, sdir / "preview.wav", suffixes=AUDIO_SUFFIXES)
        for sub in session.substems:
            if sub.id == target and sub.file_path:
                return confined_file(settings.MUSIC_LIBRARY, sub.file_path, suffixes=AUDIO_SUFFIXES)
        raise FileNotFoundError(f"Audio target {target!r} not found")

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
        total_frames = int(info.frames)
        if total_frames <= 0 or sr <= 0:
            return {
                "session_id": session_id,
                "status": "placeholder",
                "implementation_status": "placeholder",
                "region_start": session.region_start,
                "region_end": session.region_end,
                "message": "Parent stem contains no audio frames",
            }
        total_dur = total_frames / sr
        reg_start = float(session.region_start)
        reg_end = float(session.region_end)
        if reg_start < 0.0 or reg_start >= total_dur:
            reg_start = 0.0
        if reg_end <= reg_start or reg_end > total_dur:
            bpm_val = float(session.bpm or 120.0)
            four_bars = (60.0 / bpm_val) * 16.0 if bpm_val > 0 else 8.0
            reg_end = min(total_dur, reg_start + four_bars)
            if reg_end <= reg_start:
                reg_end = total_dur
        session.region_start = round(reg_start, 4)
        session.region_end = round(reg_end, 4)
        self._cache[session_id] = session
        _save_session(session)

        start = max(0, min(int(round(reg_start * sr)), total_frames - 1))
        end = max(start + 1, min(int(round(reg_end * sr)), total_frames))
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
