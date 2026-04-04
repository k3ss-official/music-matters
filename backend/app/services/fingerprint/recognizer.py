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
    Identify a track.  Always returns a dict shaped like::

        {
            "acoustid": {          # None when fpcalc/key unavailable
                "score": 0.95,
                "title": "...",
                "artist": "...",
                "album": "...",
                "year": 2003,
                "mbid": "..."
            } | None,
            "library_match": {     # Best match found in local library
                "track_id": "...",
                "title": "...",
                "artist": "...",
                "similarity": 0.87
            } | None,
            "fpcalc_available": bool,
            "acoustid_key_configured": bool,
        }
    """
    fpcalc_ok = shutil.which("fpcalc") is not None
    key_ok = bool(settings.ACOUSTID_API_KEY)

    acoustid_result: dict | None = None
    if fpcalc_ok and key_ok:
        try:
            acoustid_result = await _acoustid_lookup(audio_path)
        except Exception as exc:
            logger.warning("AcoustID lookup failed: %s", exc)

    library_result = _library_match(audio_path)

    return {
        "acoustid": acoustid_result,
        "library_match": library_result,
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

def _library_match(audio_path: Path) -> dict | None:
    """Find the most similar track already in the local library."""
    try:
        from app.services.fingerprint.audio_fingerprint import get_fingerprint_service
        from app.services.pipeline import pipeline

        tracks = list(pipeline._tracks.values())
        if not tracks:
            return None

        svc = get_fingerprint_service()
        library_paths = [
            str(t.original_path)
            for t in tracks
            if t.original_path and t.original_path.exists()
            # skip comparing a track against itself
            and t.original_path.resolve() != audio_path.resolve()
        ]

        if not library_paths:
            return None

        results = svc.find_similar(str(audio_path), library_paths, threshold=0.0)
        if not results:
            return None

        best = max(results, key=lambda r: r.get("similarity", 0))
        best_path = Path(best["file_path"])

        # Find the matching TrackRecord
        for t in tracks:
            if t.original_path and t.original_path.resolve() == best_path.resolve():
                return {
                    "track_id": str(t.track_id),
                    "title": t.title,
                    "artist": t.artist,
                    "similarity": round(best.get("similarity", 0), 3),
                }
    except Exception as exc:
        logger.warning("Library match failed: %s", exc)

    return None
