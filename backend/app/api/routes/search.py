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
    query: str = ""
    limit: int = 10
    source: str = "youtube"  # youtube, soundcloud, musicbrainz, library, all
    hints: Optional[str] = None
    year_from: Optional[int] = None
    year_to: Optional[int] = None


class ResolveUrlRequest(BaseModel):
    url: str


def _detect_platform(url: str) -> str:
    lower = url.lower()
    if "youtube.com" in lower or "youtu.be" in lower:
        return "youtube"
    if "soundcloud.com" in lower:
        return "soundcloud"
    if "bandcamp.com" in lower:
        return "bandcamp"
    if "spotify.com" in lower:
        return "spotify"
    if "music.apple.com" in lower:
        return "apple_music"
    return "web"


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
    """Search YouTube, SoundCloud, MusicBrainz, and local library with graceful fallback."""
    import asyncio

    raw_query = (request.query or "").strip()
    hints = (request.hints or "").strip()
    effective_query = " ".join(part for part in [raw_query, hints] if part).strip()
    capped_limit = max(1, min(request.limit, 25))

    if not effective_query:
        return {
            "query": raw_query,
            "hints": hints,
            "source": request.source,
            "count": 0,
            "tracks": [],
            "narrative": ["Enter a track title, artist, lyrics, or description to search."],
            "online_available": True,
        }

    results: list[dict] = []
    narrative: list[str] = []
    sources_status: dict[str, str] = {}
    req_source = (request.source or "youtube").lower()

    # 1. Local library matches (always fast, works 100% offline)
    if req_source in ("all", "library", "youtube", "soundcloud", "musicbrainz"):
        try:
            lib_matches = _search_library_tracks(effective_query, limit=min(capped_limit, 10))
            if lib_matches:
                narrative.append(f"Found {len(lib_matches)} matching track(s) in your local library.")
                for item in lib_matches:
                    if req_source == "library" or req_source == "all":
                        results.append({
                            **item,
                            "source": "library",
                            "in_library": True,
                        })
            sources_status["library"] = "ok"
        except Exception as exc:
            sources_status["library"] = f"error: {exc}"

    def _run_ytdlp_search(prefix: str, src_label: str) -> list[dict]:
        import yt_dlp

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "extract_flat": True,
            "socket_timeout": 8,
        }
        search_query = f"{prefix}{capped_limit}:{effective_query}"
        found: list[dict] = []
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(search_query, download=False)
            entries = (result or {}).get("entries") or []
            for entry in entries[:capped_limit]:
                if not entry:
                    continue
                entry_id = entry.get("id") or ""
                raw_title = entry.get("title") or effective_query
                uploader = entry.get("artist") or entry.get("uploader") or entry.get("channel") or "Unknown"
                if uploader == "Unknown" and " - " in raw_title:
                    parts = raw_title.split(" - ", 1)
                    uploader, raw_title = parts[0].strip(), parts[1].strip()
                direct_url = entry.get("url") or entry.get("webpage_url") or ""
                if src_label == "youtube":
                    if not direct_url.startswith("http") and entry_id:
                        direct_url = f"https://www.youtube.com/watch?v={entry_id}"
                    found.append({
                        "id": entry_id or direct_url,
                        "title": raw_title,
                        "artist": uploader,
                        "url": direct_url,
                        "youtube_url": direct_url,
                        "duration": entry.get("duration"),
                        "thumbnail": entry.get("thumbnail"),
                        "source": "youtube",
                    })
                else:
                    found.append({
                        "id": entry_id or direct_url,
                        "title": raw_title,
                        "artist": uploader,
                        "url": direct_url,
                        "soundcloud_url": direct_url,
                        "duration": entry.get("duration"),
                        "thumbnail": entry.get("thumbnail"),
                        "source": "soundcloud",
                    })
        return found

    # 2. YouTube search
    if req_source in ("youtube", "all"):
        narrative.append(f"Searching YouTube audio streams for '{effective_query}'…")
        try:
            yt_tracks = await asyncio.to_thread(_run_ytdlp_search, "ytsearch", "youtube")
            results.extend(yt_tracks)
            sources_status["youtube"] = "ok"
            narrative.append(f"YouTube returned {len(yt_tracks)} candidate stream(s).")
        except Exception as exc:
            sources_status["youtube"] = f"offline ({exc})"
            narrative.append("YouTube search unreachable — falling back to alternative sources.")

    # 3. SoundCloud search
    if req_source in ("soundcloud", "all"):
        narrative.append(f"Searching SoundCloud catalog for '{effective_query}'…")
        try:
            sc_tracks = await asyncio.to_thread(_run_ytdlp_search, "scsearch", "soundcloud")
            results.extend(sc_tracks)
            sources_status["soundcloud"] = "ok"
            narrative.append(f"SoundCloud returned {len(sc_tracks)} stream(s).")
        except Exception as exc:
            sources_status["soundcloud"] = f"offline ({exc})"
            narrative.append("SoundCloud search unreachable.")

    # 4. MusicBrainz / TrackFinder (especially useful for artist + lyrics/explain hints)
    if req_source in ("musicbrainz", "all") or (hints and len(results) < 3):
        narrative.append("Querying MusicBrainz metadata & hint matcher…")
        try:
            from app.services.search.track_finder import get_track_finder

            finder = get_track_finder()
            mb_items = await asyncio.to_thread(
                finder._search_musicbrainz,
                raw_query or hints,
                request.year_from,
                request.year_to,
            )
            if hints:
                mb_items = finder._apply_hints(mb_items, hints)
            for item in mb_items[:capped_limit]:
                item.section_hint = finder._guess_section_hint(item.title)
                d = item.to_dict()
                results.append({
                    "id": d["id"],
                    "title": d["title"],
                    "artist": d["artist"],
                    "year": d.get("year"),
                    "duration": round(d["duration_ms"] / 1000) if d.get("duration_ms") else None,
                    "source": "musicbrainz",
                    "confidence": d.get("confidence"),
                    "section_hint": d.get("section_hint"),
                    "url": f"{d['artist']} - {d['title']}",
                })
            sources_status["musicbrainz"] = "ok"
            narrative.append(f"MusicBrainz matched {min(len(mb_items), capped_limit)} recording(s).")
        except Exception as exc:
            sources_status["musicbrainz"] = f"offline ({exc})"

    # If online sources yielded nothing, include local library matches even if req_source was youtube/soundcloud
    if not results:
        fallback_lib = _search_library_tracks(effective_query, limit=capped_limit)
        if fallback_lib:
            for item in fallback_lib:
                results.append({**item, "source": "library", "in_library": True})
            narrative.append(f"Online sources returned 0 hits; showing {len(fallback_lib)} local library track(s).")

    online_ok = any(v == "ok" for k, v in sources_status.items() if k != "library")

    return {
        "query": raw_query,
        "hints": hints,
        "effective_query": effective_query,
        "source": request.source,
        "count": len(results),
        "tracks": results[: capped_limit * 2],
        "sources_status": sources_status,
        "online_available": online_ok or req_source == "library",
        "narrative": narrative,
    }


@router.post("/resolve-url")
async def resolve_track_url(request: ResolveUrlRequest):
    """Inspect a track URL (YouTube, SoundCloud, Bandcamp, etc.) before or during ingest."""
    import asyncio

    url = (request.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    if not url.startswith(("http://", "https://")) and any(
        url.startswith(prefix) for prefix in ("youtu.be/", "youtube.com/", "www.youtube.com/", "soundcloud.com/", "bandcamp.com/")
    ):
        url = f"https://{url}"

    platform = _detect_platform(url)

    def _extract():
        import yt_dlp

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "extract_flat": True,
            "socket_timeout": 8,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info and "entries" in info and info["entries"]:
                info = info["entries"][0]
            return info or {}

    try:
        info = await asyncio.to_thread(_extract)
        title = info.get("title") or url.rstrip("/").split("/")[-1] or "Untitled Track"
        artist = info.get("artist") or info.get("uploader") or info.get("channel") or "Unknown Artist"
        return {
            "url": url,
            "platform": platform,
            "resolved": True,
            "title": title,
            "artist": artist,
            "duration": info.get("duration"),
            "thumbnail": info.get("thumbnail"),
        }
    except Exception as exc:
        fragment = url.rstrip("/").split("/")[-1] or "Direct URL"
        return {
            "url": url,
            "platform": platform,
            "resolved": False,
            "title": fragment,
            "artist": platform.replace("_", " ").title(),
            "duration": None,
            "thumbnail": None,
            "note": f"Metadata preview unavailable ({exc}) — direct ingest will still proceed.",
        }
