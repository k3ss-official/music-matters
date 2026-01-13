"""
Music Matters - Search & Discovery Routes
Multi-source track search with intelligent filtering
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.api.schemas import SearchRequest, SearchResult

router = APIRouter(tags=["search"])


class ArtistSearchRequest(BaseModel):
    artist: str
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    track_types: Optional[List[str]] = None  # ['original', 'remix', 'collaboration', 'production']
    limit: int = 50


class TrackSearchRequest(BaseModel):
    query: str
    limit: int = 20


@router.post("/search/artist")
async def search_by_artist(request: ArtistSearchRequest):
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


@router.get("/search/tracks")
async def search_tracks_get(q: str = "", limit: int = 20):
    """Search for tracks via GET (frontend expectation)."""
    from app.api.schemas import SearchRequest
    from app.services.pipeline import pipeline
    payload = SearchRequest(query=q)
    results = pipeline.search_tracks(payload)
    return {
        "results": [
            {
                "id": str(r.track_id),
                "artist": r.artist,
                "title": r.title,
                "status": r.status,
                "source": r.source
            }
            for r in results[:limit]
        ]
    }


@router.get("/search/artists")
async def search_artists_get(q: str = ""):
    """Search for artists via GET."""
    from app.services.search.metadata_service import get_metadata_service
    service = get_metadata_service()
    artists = service.search_artists(q)
    return {
        "results": [
            {
                "id": a.get("id"),
                "name": a.get("name"),
                "type": a.get("type"),
                "country": a.get("country")
            }
            for a in artists
        ]
    }


@router.post("/search")
async def search_tracks_general(payload: SearchRequest):
    """General search across library and metadata."""
    from app.services.pipeline import pipeline
    results = pipeline.search_tracks(payload)
    return {
        "tracks": [
            {
                "id": str(r.track_id),
                "artist": r.artist,
                "title": r.title,
                "status": r.status,
                "source": r.source
            }
            for r in results
        ]
    }


@router.get("/preview/{track_id}")
async def get_preview_url(track_id: str):
    """Get preview URL for a track."""
    # This would integrate with Spotify/YouTube for preview URLs
    return {"track_id": track_id, "preview_url": None, "message": "Preview generation coming soon"}
