"""
MLX analyser — analysis chain for pipeline consumption.

Priority order:
  1. allin1  — beats + downbeats + key + chords + structure (single pass)
  2. BeatNet — beats + downbeats via offline DBN (replaces madmom)
  3. librosa — beat tracker only (last resort)
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def analyze_with_allin1(audio_path: Path) -> dict[str, Any]:
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


def analyze_with_beatnet(audio_path: Path) -> dict[str, Any]:
    """
    BeatNet offline DBN — beats + downbeats in a single model pass.
    Replaces madmom: more accurate downbeat detection, no separate RNN pass.
    Output rows: [beat_time, beat_number_in_bar] (1-indexed bar position).
    """
    import numpy as np
    import soundfile as sf
    import librosa

    info = sf.info(str(audio_path))
    duration = info.frames / float(info.samplerate)

    from BeatNet.BeatNet import BeatNet  # noqa: PLC0415
    estimator = BeatNet(1, mode="offline", inference_model="DBN", plot=[], thread=False)
    output = estimator.process(str(audio_path))
    # output: ndarray [[beat_time, beat_number_in_bar], ...]
    beat_times = [float(row[0]) for row in output]
    downbeat_times = [float(row[0]) for row in output if int(row[1]) == 1]

    # BPM from median inter-beat interval
    if len(beat_times) >= 2:
        ibi = np.diff(beat_times)
        bpm = round(float(60.0 / np.median(ibi)), 2)
    else:
        bpm = 120.0

    # Key from chroma (BeatNet doesn't provide key)
    y, sr = librosa.load(str(audio_path), sr=None, mono=True, duration=120.0)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_idx = int(chroma.mean(axis=1).argmax())
    keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    logger.info(
        "BeatNet OK — bpm=%.1f beats=%d downbeats=%d",
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


def analyze_fallback(audio_path: Path) -> dict[str, Any]:
    """Librosa beat tracker — last resort when allin1 and BeatNet both fail."""
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


def analyze_track(audio_path: Path) -> dict[str, Any]:
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
        logger.warning("allin1 failed (%s), trying BeatNet", exc)

    try:
        result = analyze_with_beatnet(audio_path)
        result.update(base)
        return result
    except Exception as exc:
        logger.warning("BeatNet failed (%s), falling back to librosa", exc)

    result = analyze_fallback(audio_path)
    result.update(base)
    return result
