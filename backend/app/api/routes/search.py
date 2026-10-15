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
    track_types: Optional[List[str]] = (
        None  # ['original', 'remix', 'collaboration', 'production']
    )
    limit: int = 50


class TrackSearchRequest(BaseModel):
    query: str
    limit: int = 20
    source: str = "youtube"  # youtube, soundcloud


class OnlineSearchRequest(BaseModel):
    query: str
    limit: int = 10
    source: str = "youtube"  # youtube or soundcloud


def _search_library_tracks(query: str, limit: int = 20) -> list[dict]:
    from app.api import schemas
    from app.services.pipeline import pipeline

    capped_limit = max(1, min(limit, 100))
    matches = pipeline.search_tracks(schemas.SearchRequest(query=query))
    out: list[dict] = []
    for item in matches[:capped_limit]:
        rec = pipeline._tracks.get(item.track_id)
        out.append(
            {
                "id": str(item.track_id),
                "track_id": str(item.track_id),
                "title": item.title,
                "artist": item.artist or "Unknown",
                "bpm": rec.bpm if rec else None,
                "key": rec.musical_key if rec else None,
                "status": item.status,
                "source": item.source,
                "confidence": item.confidence,
            }
        )
    return out


@router.get("/artists")
async def search_artists_get(q: str = "", limit: int = 20):
    """Search artists across the local library."""
    from app.services.pipeline import pipeline

    capped_limit = max(1, min(limit, 100))
    needle = q.strip().lower()
    artists_map: dict[str, dict] = {}
    for rec in pipeline._tracks.values():
        artist_name = (rec.artist or "").strip()
        if not artist_name:
            continue
        if needle and needle not in artist_name.lower() and needle not in rec.title.lower():
            continue
        key = artist_name.lower()
        if key not in artists_map:
            artists_map[key] = {
                "name": artist_name,
                "track_count": 0,
                "tracks": [],
            }
        artists_map[key]["track_count"] += 1
        if len(artists_map[key]["tracks"]) < 20:
            artists_map[key]["tracks"].append(
                {
                    "track_id": str(rec.track_id),
                    "title": rec.title,
                    "bpm": rec.bpm,
                    "key": rec.musical_key,
                }
            )
    artists = list(artists_map.values())[:capped_limit]
    return {"query": q, "count": len(artists), "artists": artists}


@router.post("/artist")
async def search_by_artist(request: SearchRequest):
    """Search for tracks by artist in the local library."""
    tracks = _search_library_tracks(request.artist, limit=request.limit)
    return {
        "artist": request.artist,
        "total_tracks": len(tracks),
        "tracks": tracks,
    }


@router.get("/tracks")
async def search_tracks_get(q: str = "", limit: int = 20):
    """Search tracks by query in the local library."""
    tracks = _search_library_tracks(q, limit=limit)
    return {
        "query": q,
        "count": len(tracks),
        "tracks": tracks,
    }


@router.post("/tracks")
async def search_tracks_post(request: TrackSearchRequest):
    """Search tracks by query in the local library."""
    tracks = _search_library_tracks(request.query, limit=request.limit)
    return {
        "query": request.query,
        "source": request.source,
        "count": len(tracks),
        "tracks": tracks,
    }


@router.post("/online")
async def search_online(request: OnlineSearchRequest):
    """Search YouTube/SoundCloud for tracks (no API keys needed)."""
    from app.services.search.download_service import DownloadService

    try:
        dl = DownloadService()
        results = []

        if request.source == "youtube":
            # Use yt-dlp to search YouTube
            import yt_dlp

            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "extract_flat": "infinite",
            }
            search_query = f"ytsearch{request.limit}:{request.query}"
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                result = ydl.extract_info(search_query, download=False)
                if result and "entries" in result:
                    for entry in result["entries"][: request.limit]:
                        results.append(
                            {
                                "id": entry.get("id", ""),
                                "title": entry.get("title", ""),
                                "artist": entry.get("uploader", "Unknown"),
                                "youtube_url": f"https://youtube.com/watch?v={entry.get('id')}",
                                "duration": entry.get("duration"),
                                "thumbnail": entry.get("thumbnail"),
                                "source": "youtube",
                            }
                        )
        elif request.source == "soundcloud":
            import yt_dlp

            ydl_opts = {
                "quiet": True,
                "no_warnings": True,
                "extract_flat": "infinite",
            }
            search_query = f"scsearch{request.limit}:{request.query}"
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                result = ydl.extract_info(search_query, download=False)
                if result and "entries" in result:
                    for entry in result["entries"][: request.limit]:
                        results.append(
                            {
                                "id": entry.get("id", ""),
                                "title": entry.get("title", ""),
                                "artist": entry.get("uploader", "Unknown"),
                                "soundcloud_url": entry.get("url", ""),
                                "duration": entry.get("duration"),
                                "thumbnail": entry.get("thumbnail"),
                                "source": "soundcloud",
                            }
                        )

        return {
            "query": request.query,
            "source": request.source,
            "count": len(results),
            "tracks": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
