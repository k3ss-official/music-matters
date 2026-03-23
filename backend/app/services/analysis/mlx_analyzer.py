"""
MLX analyser — wraps allin1.analyze() for pipeline consumption.

Returns BPM, key, beats, downbeats, chords, and structural segments
in a single model pass, replacing the old librosa + heuristic stack.

Falls back to librosa BPM + chroma key if allin1 is unavailable.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)


def analyze_with_allin1(audio_path: Path) -> Dict[str, Any]:
    """
    Run allin1.analyze() and return a normalised dict ready for pipeline.

    The natten compatibility shim is applied here, before allin1 is imported,
    so this function is safe to call from any context.
    """
    # Must patch natten BEFORE allin1 is imported for the first time
    from app.services.analysis.natten_compat import patch_natten
    patch_natten()

    import allin1  # noqa: PLC0415

    logger.info("allin1: analysing %s", audio_path)
    result = allin1.analyze(str(audio_path))

    beats = (
        result.beats.tolist()
        if hasattr(result.beats, "tolist")
        else list(result.beats)
    )
    downbeats = (
        result.downbeats.tolist()
        if hasattr(result.downbeats, "tolist")
        else list(result.downbeats)
    )
    segments = [
        {
            "type": seg.label,
            "start_time": float(seg.start),
            "end_time": float(seg.end),
            "confidence": float(getattr(seg, "confidence", 0.85)),
        }
        for seg in result.segments
    ]
    chords = [
        {"start": float(c.start), "end": float(c.end), "chord": c.label}
        for c in result.chords
    ]

    return {
        "bpm": float(result.bpm),
        "key": str(result.key),
        "beats": beats,
        "downbeats": downbeats,
        "segments": segments,
        "chords": chords,
    }


def analyze_with_madmom(audio_path: Path) -> Dict[str, Any]:
    """
    madmom RNN beat + downbeat tracker — accurate to ~10ms, handles tempo changes.
    Only called if madmom is installed.
    """
    import madmom
    import soundfile as sf
    import numpy as np

    info = sf.info(str(audio_path))
    duration = info.frames / float(info.samplerate)

    # RNN beat processor → DBN beat tracker (handles tempo variations well)
    proc = madmom.features.beats.RNNBeatProcessor()
    dbn  = madmom.features.beats.DBNBeatTrackingProcessor(fps=100)
    beat_times = dbn(proc(str(audio_path))).tolist()

    # Downbeat: RNN downbeat processor
    try:
        db_proc = madmom.features.downbeats.RNNDownBeatProcessor()
        db_dbn  = madmom.features.downbeats.DBNDownBeatTrackingProcessor(
            beats_per_bar=[3, 4], fps=100
        )
        db_out  = db_dbn(db_proc(str(audio_path)))
        # db_out columns: [beat_time, beat_number_in_bar]
        downbeat_times = [float(row[0]) for row in db_out if int(row[1]) == 1]
    except Exception:
        # Fallback: derive downbeats from every 4th beat
        downbeat_times = beat_times[::4] if beat_times else []

    # BPM from median inter-beat interval
    if len(beat_times) >= 2:
        ibi = np.diff(beat_times)
        bpm = round(float(60.0 / np.median(ibi)), 2)
    else:
        bpm = 120.0

    # Basic key from chroma
    import librosa
    y, sr = librosa.load(str(audio_path), sr=None, mono=True, duration=120.0)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_idx = int(chroma.mean(axis=1).argmax())
    keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    logger.info(
        "madmom OK — bpm=%.1f beats=%d downbeats=%d",
        bpm, len(beat_times), len(downbeat_times),
    )
    return {
        "bpm": bpm,
        "key": keys[key_idx],
        "duration": duration,
        "sample_rate": info.samplerate,
        "beats": beat_times,
        "downbeats": downbeat_times,
        "segments": [],
        "chords": [],
    }


def analyze_fallback(audio_path: Path) -> Dict[str, Any]:
    """Librosa beat tracker — used only when madmom is also unavailable."""
    import librosa
    import soundfile as sf

    info = sf.info(str(audio_path))
    duration = info.frames / float(info.samplerate)
    y, sr = librosa.load(str(audio_path), sr=None, mono=True, duration=120.0)

    # Beat tracking — keep the timestamps this time
    tempo_arr, beat_frames = librosa.beat.beat_track(y=y, sr=sr, tightness=100, trim=False)
    bpm = float(tempo_arr[0] if hasattr(tempo_arr, "__len__") else tempo_arr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    # Derive downbeats: every 4th beat (rough estimate — no actual bar detection)
    downbeats = beat_times[::4] if len(beat_times) >= 4 else beat_times[:1]

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_idx = int(chroma.mean(axis=1).argmax())
    keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    logger.info("librosa fallback — bpm=%.1f beats=%d downbeats=%d", bpm, len(beat_times), len(downbeats))
    return {
        "bpm": bpm,
        "key": keys[key_idx],
        "duration": duration,
        "sample_rate": info.samplerate,
        "beats": beat_times,
        "downbeats": downbeats,
        "segments": [],
        "chords": [],
    }


def analyze_track(audio_path: Path) -> Dict[str, Any]:
    """
    Primary entry-point.  Tries allin1 → madmom → librosa (last resort).
    Always returns the same dict shape.
    """
    import soundfile as sf

    info = sf.info(str(audio_path))
    base = {
        "duration": info.frames / float(info.samplerate),
        "sample_rate": info.samplerate,
    }

    try:
        result = analyze_with_allin1(audio_path)
        result.update(base)
        logger.info(
            "allin1 OK — bpm=%.1f key=%s beats=%d downbeats=%d segs=%d",
            result["bpm"],
            result["key"],
            len(result["beats"]),
            len(result["downbeats"]),
            len(result["segments"]),
        )
        return result
    except Exception as exc:
        logger.warning("allin1 failed (%s), trying madmom", exc)

    try:
        result = analyze_with_madmom(audio_path)
        result.update(base)
        logger.info(
            "madmom OK — bpm=%.1f key=%s beats=%d downbeats=%d",
            result["bpm"],
            result["key"],
            len(result["beats"]),
            len(result["downbeats"]),
        )
        return result
    except Exception as exc:
        logger.warning("madmom failed (%s), falling back to librosa", exc)

    result = analyze_fallback(audio_path)
    result.update(base)
    return result
