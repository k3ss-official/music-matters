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
