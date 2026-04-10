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


def _compute_beatgrid_anchor(beats: list[float], bpm: float, time_sig: int = 4) -> float:
    """
    Find the optimal beatgrid anchor using phase-alignment scoring.

    Traktor's approach: a single authoritative first-downbeat timestamp is used
    to derive every bar boundary as ``anchor + N × bar_duration``.  This prevents
    the accumulated drift that occurs when downbeats are taken as every Nth
    librosa beat (which may start mid-bar).

    Algorithm: score each of the first ``time_sig`` detected beats as a
    candidate anchor by counting how many predicted bar positions have a
    detected beat within ±35 % of one beat interval.  The candidate with the
    highest score wins.
    """
    if not beats or bpm <= 0:
        return 0.0

    beat_dur = 60.0 / bpm
    bar_dur = beat_dur * time_sig
    last_beat = beats[-1]

    best_score = -1.0
    best_anchor = beats[0]

    # Only test the first bar's worth of beats as candidates (4 beats for 4/4)
    for candidate in beats[:time_sig]:
        score = 0.0
        t = candidate
        while t <= last_beat + bar_dur:
            # Count a hit if any detected beat lands within ±35 % of a beat interval
            if any(abs(b - t) < beat_dur * 0.35 for b in beats):
                score += 1.0
            t += bar_dur
        if score > best_score:
            best_score = score
            best_anchor = candidate

    logger.debug("beatgrid anchor=%.4fs score=%.1f bpm=%.1f", best_anchor, best_score, bpm)
    return best_anchor


def analyze_track(audio_path: Path) -> dict[str, Any]:
    """
    Primary entry-point.  Tries allin1 → BeatNet → librosa (last resort).
    Always returns the same dict shape, including a ``beatgrid_anchor`` key
    that downstream loop slicers use to derive bar positions without drift.
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
    except Exception as exc:
        logger.warning("allin1 failed (%s), trying BeatNet", exc)
        try:
            result = analyze_with_beatnet(audio_path)
            result.update(base)
        except Exception as exc2:
            logger.warning("BeatNet failed (%s), falling back to librosa", exc2)
            result = analyze_fallback(audio_path)
            result.update(base)

    # Compute phase-aligned beatgrid anchor (Traktor-style)
    beats: list[float] = result.get("beats") or []
    bpm: float = result.get("bpm") or 120.0
    anchor = _compute_beatgrid_anchor(beats, bpm)
    result["beatgrid_anchor"] = anchor

    return result
