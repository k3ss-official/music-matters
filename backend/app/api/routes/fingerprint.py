"""
Music Matters - Audio Fingerprinting Routes
Similarity detection, duplicate finding, semantic search, Shazam-style recognition
"""
import tempfile
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.config import settings
from app.security import AUDIO_SUFFIXES, confined_file

router = APIRouter(prefix="/fingerprint", tags=["fingerprint"])


class FingerprintRequest(BaseModel):
    audio_path: str


class SimilarityRequest(BaseModel):
    audio_path1: str
    audio_path2: str


class FindSimilarRequest(BaseModel):
    audio_path: str
    library_paths: List[str]
    threshold: float = 0.7


@router.post("/generate")
async def generate_fingerprint(request: FingerprintRequest):
    """Generate audio fingerprint for a track."""
    from app.services.fingerprint.audio_fingerprint import get_fingerprint_service

    audio_path = confined_file(
        settings.MUSIC_LIBRARY, request.audio_path, suffixes=AUDIO_SUFFIXES
    )

    try:
        service = get_fingerprint_service()
        fingerprint = service.generate_fingerprint(str(audio_path))

        return {
            "audio_path": str(audio_path),
            "fingerprint": fingerprint,
            "success": True
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compare")
async def compare_tracks(request: SimilarityRequest):
    """Compare similarity between two tracks."""
    from app.services.fingerprint.audio_fingerprint import get_fingerprint_service

    path1 = confined_file(
        settings.MUSIC_LIBRARY, request.audio_path1, suffixes=AUDIO_SUFFIXES
    )
    path2 = confined_file(
        settings.MUSIC_LIBRARY, request.audio_path2, suffixes=AUDIO_SUFFIXES
    )

    try:
        service = get_fingerprint_service()
        similarity = service.compare_tracks(
            str(path1),
            str(path2)
        )

        return {
            "track1": str(path1),
            "track2": str(path2),
            "similarity_score": similarity,
            "is_similar": similarity > 0.7
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/find-similar")
async def find_similar_tracks(request: FindSimilarRequest):
    """Find similar tracks in a library."""
    from app.services.fingerprint.audio_fingerprint import get_fingerprint_service

    query_path = confined_file(
        settings.MUSIC_LIBRARY, request.audio_path, suffixes=AUDIO_SUFFIXES
    )
    confined_library = [
        str(confined_file(settings.MUSIC_LIBRARY, p, suffixes=AUDIO_SUFFIXES))
        for p in request.library_paths
    ]

    try:
        service = get_fingerprint_service()
        similar = service.find_similar(
            audio_path=str(query_path),
            library_paths=confined_library,
            threshold=request.threshold
        )

        return {
            "query_track": str(query_path),
            "similar_tracks": similar,
            "count": len(similar)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recognize")
async def recognize_track(audio: UploadFile = File(...)):
    """
    Shazam-style track recognition.

    Upload a short audio clip (≥10 s recommended).  Returns an AcoustID match
    when fpcalc is installed and ACOUSTID_API_KEY is configured in settings,
    plus the best similarity match within the local library.
    """
    suffix = Path(audio.filename or "clip.wav").suffix.lower() or ".wav"
    if suffix not in AUDIO_SUFFIXES:
        raise HTTPException(status_code=400, detail=f"Unsupported audio format: {suffix}")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = Path(tmp.name)

    try:
        from app.services.fingerprint.recognizer import recognize_audio
        result = await recognize_audio(tmp_path)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        tmp_path.unlink(missing_ok=True)
