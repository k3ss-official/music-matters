"""
Music Matters - Audio Fingerprinting Routes
Similarity detection, duplicate finding, semantic search
"""
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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
    
    try:
        service = get_fingerprint_service()
        fingerprint = service.generate_fingerprint(request.audio_path)
        
        return {
            "audio_path": request.audio_path,
            "fingerprint": fingerprint,
            "success": True
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compare")
async def compare_tracks(request: SimilarityRequest):
    """Compare similarity between two tracks."""
    from app.services.fingerprint.audio_fingerprint import get_fingerprint_service
    
    try:
        service = get_fingerprint_service()
        similarity = service.compare_tracks(
            request.audio_path1,
            request.audio_path2
        )
        
        return {
            "track1": request.audio_path1,
            "track2": request.audio_path2,
            "similarity_score": similarity,
            "is_similar": similarity > 0.7
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/find-similar")
async def find_similar_tracks(request: FindSimilarRequest):
    """Find similar tracks in a library."""
    from app.services.fingerprint.audio_fingerprint import get_fingerprint_service
    
    try:
        service = get_fingerprint_service()
        similar = service.find_similar(
            audio_path=request.audio_path,
            library_paths=request.library_paths,
            threshold=request.threshold
        )
        
        return {
            "query_track": request.audio_path,
            "similar_tracks": similar,
            "count": len(similar)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
