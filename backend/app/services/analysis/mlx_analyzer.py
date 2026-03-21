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


def analyze_fallback(audio_path: Path) -> Dict[str, Any]:
    """Librosa-only fallback used when allin1 is unavailable."""
    import librosa
    import soundfile as sf

    info = sf.info(str(audio_path))
    duration = info.frames / float(info.samplerate)
    y, sr = librosa.load(str(audio_path), sr=None, mono=True, duration=120.0)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(tempo[0] if hasattr(tempo, "__len__") else tempo)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_idx = int(chroma.mean(axis=1).argmax())
    keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    return {
        "bpm": bpm,
        "key": keys[key_idx],
        "duration": duration,
        "sample_rate": info.samplerate,
        "beats": [],
        "downbeats": [],
        "segments": [],
        "chords": [],
    }


def analyze_track(audio_path: Path) -> Dict[str, Any]:
    """
    Primary entry-point.  Tries allin1 first, falls back to librosa on error.
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
        logger.warning("allin1 failed (%s), falling back to librosa", exc)
        result = analyze_fallback(audio_path)
        result.update(base)
        return result
