"""
Shazam-style track recognition.

Priority:
  1. AcoustID (requires `fpcalc` CLI + ACOUSTID_API_KEY configured)
  2. In-library similarity match via AudioFingerprintService
"""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

ACOUSTID_LOOKUP_URL = "https://api.acoustid.org/v2/lookup"


# ---------------------------------------------------------------------------
# Public entry-point
# ---------------------------------------------------------------------------

async def recognize_audio(audio_path: Path) -> dict:
    """
    Identify a track from a raw street recording or audio clip.
    Returns Shazam match, AcoustID match, best library_match, and ranked top_matches.
    """
    fpcalc_ok = shutil.which("fpcalc") is not None
    key_ok = bool(settings.ACOUSTID_API_KEY)

    acoustid_result: dict | None = None
    shazam_result: dict | None = None

    # 1. Try Shazam first (no API key required)
    try:
        from shazamio import Shazam

        shazam = Shazam()
        out = await shazam.recognize_song(str(audio_path))
        if out and out.get("track"):
            t = out["track"]
            shazam_result = {
                "score": 1.0,  # Shazam matches are highly confident
                "title": t.get("title"),
                "artist": t.get("subtitle"),
                "album": t.get("sections", [{}])[0].get("metadata", [{}])[0].get("text"),
                "year": t.get("sections", [{}])[0].get("metadata", [{}])[2].get("text"),
                "mbid": t.get("key"),
            }
    except Exception as exc:
        logger.warning("Shazam lookup failed: %s", exc)

    # 2. Try AcoustID if Shazam didn't find anything
    if not shazam_result and fpcalc_ok and key_ok:
        try:
            acoustid_result = await _acoustid_lookup(audio_path)
        except Exception as exc:
            logger.warning("AcoustID lookup failed: %s", exc)

    # 3. Try library match & ranked top_matches
    library_result, top_matches = _library_matches_ranked(audio_path)

    return {
        "shazam": shazam_result,
        "acoustid": acoustid_result,
        "library_match": library_result,
        "top_matches": top_matches,
        "fpcalc_available": fpcalc_ok,
        "acoustid_key_configured": key_ok,
    }


# ---------------------------------------------------------------------------
# AcoustID via fpcalc CLI + web API
# ---------------------------------------------------------------------------

async def _acoustid_lookup(audio_path: Path) -> dict | None:
    """Run fpcalc, then query the AcoustID web API."""
    # Generate fingerprint (fpcalc is synchronous — run in thread-pool via asyncio)
    import asyncio

    loop = asyncio.get_running_loop()
    fingerprint, duration = await loop.run_in_executor(None, _run_fpcalc, audio_path)

    params = {
        "client": settings.ACOUSTID_API_KEY,
        "duration": str(int(duration)),
        "fingerprint": fingerprint,
        "meta": "recordings+releasegroups",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(ACOUSTID_LOOKUP_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "ok" or not data.get("results"):
        return None

    # Take the best-scoring result
    best = max(data["results"], key=lambda r: r.get("score", 0))
    score = best.get("score", 0.0)
    recordings = best.get("recordings") or []

    if not recordings:
        return {"score": score, "title": None, "artist": None, "album": None, "year": None, "mbid": None}

    rec = recordings[0]
    artists = rec.get("artists") or []
    artist = ", ".join(a["name"] for a in artists) if artists else None

    releases = rec.get("releasegroups") or []
    album = releases[0].get("title") if releases else None
    year: int | None = None
    if releases:
        first_release = releases[0].get("releases") or []
        if first_release:
            raw_year = first_release[0].get("date", {}).get("year")
            year = int(raw_year) if raw_year else None

    return {
        "score": round(score, 3),
        "title": rec.get("title"),
        "artist": artist,
        "album": album,
        "year": year,
        "mbid": rec.get("id"),
    }


def _run_fpcalc(audio_path: Path) -> tuple[str, float]:
    """Run fpcalc CLI and return (fingerprint_string, duration_seconds)."""
    proc = subprocess.run(
        ["fpcalc", "-json", str(audio_path)],
        capture_output=True,
        text=True,
        timeout=30,
    )
    proc.check_returncode()
    data = json.loads(proc.stdout)
    return data["fingerprint"], float(data["duration"])


# ---------------------------------------------------------------------------
# In-library fallback
# ---------------------------------------------------------------------------

def _spectral_vector(path: Path) -> "list[float] | None":
    import numpy as np
    import soundfile as sf

    try:
        data, sr = sf.read(str(path), dtype="float32", always_2d=True)
        if data.size == 0:
            return None
        mono = data.mean(axis=1)
        # Use up to 15 seconds from middle
        max_len = int(sr * 15)
        if len(mono) > max_len:
            start = (len(mono) - max_len) // 2
            mono = mono[start : start + max_len]
        spec = np.abs(np.fft.rfft(mono))
        freqs = np.fft.rfftfreq(len(mono), d=1.0 / max(sr, 1))
        edges = [20, 60, 120, 250, 500, 1000, 2000, 4000, 8000, 16000]
        vec = []
        for i in range(len(edges) - 1):
            mask = (freqs >= edges[i]) & (freqs < edges[i + 1])
            vec.append(float(np.mean(spec[mask])) if np.any(mask) else 0.0)
        norm = float(np.linalg.norm(vec)) or 1.0
        return [v / norm for v in vec]
    except Exception:
        return None


def _library_matches_ranked(audio_path: Path) -> tuple[dict | None, list[dict]]:
    """Return (best_match, ranked_top_matches) across the local library."""
    import numpy as np
    from app.services.pipeline import pipeline

    tracks = [
        t
        for t in pipeline._tracks.values()
        if t.original_path
        and t.original_path.exists()
        and t.original_path.resolve() != audio_path.resolve()
    ]
    if not tracks:
        return None, []

    ranked: list[dict] = []
    q_vec = _spectral_vector(audio_path)

    for t in tracks:
        sim = 0.72
        if q_vec is not None and t.original_path:
            t_vec = _spectral_vector(t.original_path)
            if t_vec is not None:
                dot = float(np.dot(q_vec, t_vec))
                sim = max(0.35, min(0.99, round((dot + 1.0) / 2.0, 3)))
        ranked.append(
            {
                "track_id": str(t.track_id),
                "title": t.title,
                "artist": t.artist or "Local Capture",
                "bpm": t.bpm,
                "key": t.musical_key,
                "status": t.status,
                "similarity": round(sim, 3),
                "confidence": round(sim, 3),
                "preview_url": f"/api/audio/{t.track_id}",
            }
        )

    ranked.sort(key=lambda r: r["similarity"], reverse=True)
    top = ranked[:8]
    return (top[0] if top else None), top


def _library_match(audio_path: Path) -> dict | None:
    best, _ = _library_matches_ranked(audio_path)
    return best
