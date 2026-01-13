"""
Music Matters - Search & Discovery Routes
Multi-source track search with intelligent filtering
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import yt_dlp
import re

router = APIRouter(tags=["search"])


class ArtistSearchRequest(BaseModel):
    artist: str
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    track_types: Optional[List[str]] = None
    limit: int = 50


class TrackSearchRequest(BaseModel):
    query: str
    limit: int = 20


def search_youtube(query: str, limit: int = 20) -> List[dict]:
    """Search YouTube for tracks using yt-dlp."""
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'default_search': 'ytsearch',
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Search YouTube
            search_query = f"ytsearch{limit}:{query}"
            results = ydl.extract_info(search_query, download=False)
            
            if not results or 'entries' not in results:
                return []
            
            tracks = []
            for entry in results['entries']:
                if not entry:
                    continue
                    
                # Parse artist and title from video title
                title = entry.get('title', '')
                artist, track_title = parse_artist_title(title)
                
                tracks.append({
                    'id': entry.get('id', ''),
                    'artist': artist,
                    'title': track_title,
                    'source': 'youtube',
                    'url': f"https://www.youtube.com/watch?v={entry.get('id')}",
                    'duration': entry.get('duration', 0),
                    'thumbnail': entry.get('thumbnail', ''),
                })
            
            return tracks
            
    except Exception as e:
        print(f"YouTube search error: {e}")
        return []


def parse_artist_title(video_title: str) -> tuple[str, str]:
    """
    Parse artist and title from YouTube video title.
    
    Common formats:
    - "Artist - Title"
    - "Artist: Title"
    - "Title by Artist"
    - "Title (Artist)"
    """
    # Try "Artist - Title"
    if ' - ' in video_title:
        parts = video_title.split(' - ', 1)
        return parts[0].strip(), parts[1].strip()
    
    # Try "Artist: Title"
    if ': ' in video_title:
        parts = video_title.split(': ', 1)
        return parts[0].strip(), parts[1].strip()
    
    # Try "Title by Artist"
    if ' by ' in video_title.lower():
        parts = re.split(r' by ', video_title, flags=re.IGNORECASE)
        return parts[1].strip(), parts[0].strip()
    
    # Try "Title (Artist)"
    match = re.match(r'(.+?)\s*\((.+?)\)', video_title)
    if match:
        return match.group(2).strip(), match.group(1).strip()
    
    # Fallback: whole title
    return "Unknown Artist", video_title


@router.post("/search/artist")
async def search_by_artist(request: ArtistSearchRequest):
    """Search for tracks by artist name."""
    try:
        query = request.artist
        tracks = search_youtube(query, request.limit)
        
        return {
            "artist": request.artist,
            "count": len(tracks),
            "tracks": tracks
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search/tracks")
async def search_tracks_get(q: str = "", limit: int = 20):
    """Search for tracks via GET (frontend expectation)."""
    if not q or q.strip() == "":
        return {"results": []}
    
    try:
        tracks = search_youtube(q, limit)
        return {"results": tracks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search/artists")
async def search_artists_get(q: str = ""):
    """Search for artists via GET."""
    # For MVP, return empty - can add MusicBrainz later
    return {"results": []}


@router.post("/search")
async def search_tracks_general(payload: TrackSearchRequest):
    """General search across YouTube."""
    try:
        tracks = search_youtube(payload.query, payload.limit)
        return {"tracks": tracks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preview/{track_id}")
async def get_preview_url(track_id: str):
    """Get preview URL for a track (YouTube video ID)."""
    return {
        "track_id": track_id,
        "preview_url": f"https://www.youtube.com/watch?v={track_id}",
        "message": "YouTube preview"
    }
