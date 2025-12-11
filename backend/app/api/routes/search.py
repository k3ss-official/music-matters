"""
Music Matters - Search & Discovery Routes
Multi-source track search with intelligent filtering
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/search", tags=["search"])


class SearchRequest(BaseModel):
    artist: str
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    track_types: Optional[List[str]] = None  # ['original', 'remix', 'collaboration', 'production']
    limit: int = 50


class TrackSearchRequest(BaseModel):
    query: str
    limit: int = 20


@router.post("/artist")
async def search_by_artist(request: SearchRequest):
    """Search for tracks by artist name with filters."""
    # Import here to avoid circular dependencies
    from app.services.search.metadata_service import get_metadata_service
    
    try:
        service = get_metadata_service()
        tracks = service.get_artist_tracks(
            artist_name=request.artist,
            date_from=request.date_from,
            date_to=request.date_to,
            track_types=request.track_types
        )
        
        return {
            "artist": request.artist,
            "count": len(tracks),
            "tracks": [t.to_dict() for t in tracks[:request.limit]]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tracks")
async def search_tracks(request: TrackSearchRequest):
    """Search for tracks by title/query."""
    from app.services.search.metadata_service import get_metadata_service
    
    try:
        service = get_metadata_service()
        tracks = service.search_tracks(query=request.query, limit=request.limit)
        
        return {
            "query": request.query,
            "count": len(tracks),
            "tracks": [t.to_dict() for t in tracks]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preview/{track_id}")
async def get_preview_url(track_id: str):
    """Get preview URL for a track."""
    # This would integrate with Spotify/YouTube for preview URLs
    return {"track_id": track_id, "preview_url": None, "message": "Preview generation coming soon"}
