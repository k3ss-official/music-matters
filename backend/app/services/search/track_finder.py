"""
DJ Library Tool - Track Finder Service
Find any track: by artist, by memory, by vibe.
"""
import re
import json
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime
import urllib.request
import urllib.parse
import urllib.error

from app.config import (
    CACHE_DIR, AUDIO_SOURCES,
    YTDLP_QUALITY,
    SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
)

logger = logging.getLogger(__name__)


@dataclass
class TrackResult:
    """A track found by search."""
    id: str
    title: str
    artist: str
    year: Optional[int] = None
    track_type: str = "original"  # original, remix, collab, edit
    duration_ms: Optional[int] = None
    
    # Source info
    source: str = "unknown"  # musicbrainz, spotify, youtube, etc.
    source_url: Optional[str] = None
    preview_url: Optional[str] = None
    
    # Search metadata
    confidence: float = 0.0  # How well it matches the query
    section_hint: Optional[str] = None  # Where the good bit probably is
    
    # Extra metadata
    bpm: Optional[float] = None
    key: Optional[str] = None
    genres: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "artist": self.artist,
            "year": self.year,
            "track_type": self.track_type,
            "duration_ms": self.duration_ms,
            "source": self.source,
            "source_url": self.source_url,
            "preview_url": self.preview_url,
            "confidence": self.confidence,
            "section_hint": self.section_hint,
            "bpm": self.bpm,
            "key": self.key,
            "genres": self.genres
        }


class TrackFinder:
    """
    Find tracks from multiple sources.
    Priority: MusicBrainz (metadata) → Spotify (preview) → YouTube (download)
    """
    
    def __init__(self):
        self._cache_dir = CACHE_DIR / "search"
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._spotify_token = None
        self._spotify_token_expires = 0
    
    def search(
        self,
        artist: str,
        year_from: Optional[int] = None,
        year_to: Optional[int] = None,
        track_type: str = "all",
        hints: str = ""
    ) -> List[TrackResult]:
        """
        Search for tracks matching criteria.
        
        Args:
            artist: Artist name to search for
            year_from: Earliest release year
            year_to: Latest release year
            track_type: 'all', 'original', 'remix', 'collab'
            hints: Free text hints ("white label", lyrics, vibes, etc.)
        
        Returns:
            List of matching tracks, sorted by relevance
        """
        logger.info(f"Searching: {artist} ({year_from}-{year_to}) type={track_type} hints='{hints}'")
        
        results = []
        
        # Search MusicBrainz for accurate metadata
        mb_results = self._search_musicbrainz(artist, year_from, year_to)
        results.extend(mb_results)
        
        # Search Spotify for previews and additional tracks
        if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET:
            sp_results = self._search_spotify(artist, year_from, year_to)
            results.extend(sp_results)
        
        # Search YouTube as fallback
        yt_results = self._search_youtube(artist, year_from, year_to)
        results.extend(yt_results)
        
        # Dedupe by title similarity
        results = self._dedupe_results(results)
        
        # Filter by track type
        if track_type != "all":
            results = [r for r in results if r.track_type == track_type]
        
        # Apply hint matching to boost relevance
        if hints:
            results = self._apply_hints(results, hints)
        
        # Sort by confidence
        results.sort(key=lambda x: x.confidence, reverse=True)
        
        # Add section hints based on title analysis
        for r in results:
            r.section_hint = self._guess_section_hint(r.title)
        
        logger.info(f"Found {len(results)} tracks")
        return results[:50]  # Return top 50
    
    def get_preview_url(self, track: TrackResult) -> Optional[str]:
        """Get a playable preview URL for a track."""
        # If we already have a preview URL, use it
        if track.preview_url:
            return track.preview_url
        
        # Try to find on Spotify
        if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET:
            preview = self._get_spotify_preview(track.artist, track.title)
            if preview:
                return preview
        
        # Fallback: search YouTube for a preview
        return self._get_youtube_preview(track.artist, track.title)
    
    def download(self, track: TrackResult, output_dir: Path) -> Optional[Path]:
        """
        Download full track in best quality.
        Returns path to downloaded file.
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Build search query
        query = f"{track.artist} - {track.title}"
        if track.year:
            query += f" {track.year}"
        
        # Try YouTube Music first (usually better quality)
        for source in AUDIO_SOURCES:
            try:
                if source == "youtube_music":
                    path = self._download_ytdlp(query, output_dir, music=True)
                elif source == "youtube":
                    path = self._download_ytdlp(query, output_dir, music=False)
                elif source == "soundcloud":
                    path = self._download_soundcloud(query, output_dir)
                else:
                    continue
                
                if path and path.exists():
                    logger.info(f"Downloaded from {source}: {path}")
                    return path
                    
            except Exception as e:
                logger.warning(f"Download from {source} failed: {e}")
                continue
        
        logger.error(f"Failed to download: {query}")
        return None
    
    # =========================================================================
    # MusicBrainz Search
    # =========================================================================
    
    def _search_musicbrainz(
        self, 
        artist: str, 
        year_from: Optional[int], 
        year_to: Optional[int]
    ) -> List[TrackResult]:
        """Search MusicBrainz for tracks."""
        results = []
        
        try:
            # Build query
            query = f'artist:"{artist}"'
            if year_from and year_to:
                query += f' AND date:[{year_from} TO {year_to}]'
            elif year_from:
                query += f' AND date:[{year_from} TO *]'
            elif year_to:
                query += f' AND date:[* TO {year_to}]'
            
            url = f"https://musicbrainz.org/ws/2/recording?query={urllib.parse.quote(query)}&fmt=json&limit=50"
            
            req = urllib.request.Request(url, headers={
                "User-Agent": "DJLibraryTool/1.0 (github.com/k3ss-official)"
            })
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
            
            for recording in data.get("recordings", []):
                # Extract artist
                artists = recording.get("artist-credit", [])
                artist_name = artists[0].get("name", "Unknown") if artists else "Unknown"
                
                # Extract year from first release
                releases = recording.get("releases", [])
                year = None
                if releases:
                    date_str = releases[0].get("date", "")
                    if date_str and len(date_str) >= 4:
                        try:
                            year = int(date_str[:4])
                        except ValueError:
                            pass
                
                # Determine track type
                title = recording.get("title", "")
                track_type = self._determine_track_type(title, artists)
                
                results.append(TrackResult(
                    id=f"mb:{recording.get('id', '')}",
                    title=title,
                    artist=artist_name,
                    year=year,
                    track_type=track_type,
                    duration_ms=recording.get("length"),
                    source="musicbrainz",
                    confidence=recording.get("score", 0) / 100
                ))
                
        except Exception as e:
            logger.warning(f"MusicBrainz search failed: {e}")
        
        return results
    
    # =========================================================================
    # Spotify Search
    # =========================================================================
    
    def _get_spotify_token(self) -> Optional[str]:
        """Get Spotify API access token."""
        import time
        
        if self._spotify_token and time.time() < self._spotify_token_expires:
            return self._spotify_token
        
        if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
            return None
        
        try:
            import base64
            
            auth = base64.b64encode(
                f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()
            ).decode()
            
            data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
            req = urllib.request.Request(
                "https://accounts.spotify.com/api/token",
                data=data,
                headers={
                    "Authorization": f"Basic {auth}",
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            )
            
            with urllib.request.urlopen(req, timeout=10) as response:
                result = json.loads(response.read().decode())
                self._spotify_token = result.get("access_token")
                self._spotify_token_expires = time.time() + result.get("expires_in", 3600) - 60
                return self._spotify_token
                
        except Exception as e:
            logger.warning(f"Failed to get Spotify token: {e}")
            return None
    
    def _search_spotify(
        self, 
        artist: str, 
        year_from: Optional[int], 
        year_to: Optional[int]
    ) -> List[TrackResult]:
        """Search Spotify for tracks."""
        results = []
        token = self._get_spotify_token()
        
        if not token:
            return results
        
        try:
            query = f"artist:{artist}"
            if year_from and year_to:
                query += f" year:{year_from}-{year_to}"
            elif year_from:
                query += f" year:{year_from}-{datetime.now().year}"
            elif year_to:
                query += f" year:1900-{year_to}"
            
            url = f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type=track&limit=50"
            req = urllib.request.Request(url, headers={
                "Authorization": f"Bearer {token}"
            })
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
            
            for track in data.get("tracks", {}).get("items", []):
                artists = track.get("artists", [])
                artist_name = artists[0].get("name", "Unknown") if artists else "Unknown"
                
                # Get year from album
                album = track.get("album", {})
                release_date = album.get("release_date", "")
                year = None
                if release_date and len(release_date) >= 4:
                    try:
                        year = int(release_date[:4])
                    except ValueError:
                        pass
                
                title = track.get("name", "")
                track_type = self._determine_track_type(title, [{"name": a.get("name")} for a in artists])
                
                results.append(TrackResult(
                    id=f"sp:{track.get('id', '')}",
                    title=title,
                    artist=artist_name,
                    year=year,
                    track_type=track_type,
                    duration_ms=track.get("duration_ms"),
                    source="spotify",
                    source_url=track.get("external_urls", {}).get("spotify"),
                    preview_url=track.get("preview_url"),
                    confidence=track.get("popularity", 0) / 100
                ))
                
        except Exception as e:
            logger.warning(f"Spotify search failed: {e}")
        
        return results
    
    def _get_spotify_preview(self, artist: str, title: str) -> Optional[str]:
        """Get Spotify preview URL for a specific track."""
        token = self._get_spotify_token()
        if not token:
            return None
        
        try:
            query = f"artist:{artist} track:{title}"
            url = f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type=track&limit=1"
            req = urllib.request.Request(url, headers={
                "Authorization": f"Bearer {token}"
            })
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
            
            tracks = data.get("tracks", {}).get("items", [])
            if tracks:
                return tracks[0].get("preview_url")
                
        except Exception as e:
            logger.warning(f"Failed to get Spotify preview: {e}")
        
        return None
    
    # =========================================================================
    # YouTube Search & Download
    # =========================================================================
    
    def _search_youtube(
        self, 
        artist: str, 
        year_from: Optional[int], 
        year_to: Optional[int]
    ) -> List[TrackResult]:
        """Search YouTube for tracks (via yt-dlp search)."""
        results = []
        
        try:
            import subprocess
            
            query = f"{artist}"
            if year_from:
                query += f" {year_from}"
            
            cmd = [
                "yt-dlp",
                f"ytsearch10:{query}",
                "--dump-json",
                "--flat-playlist",
                "--no-warnings"
            ]
            
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            for line in proc.stdout.strip().split("\n"):
                if not line:
                    continue
                try:
                    video = json.loads(line)
                    
                    # Parse title to extract artist/track
                    title = video.get("title", "")
                    parsed_artist, parsed_title = self._parse_youtube_title(title)
                    
                    # Filter by artist match
                    if not self._fuzzy_match(artist.lower(), parsed_artist.lower()):
                        continue
                    
                    results.append(TrackResult(
                        id=f"yt:{video.get('id', '')}",
                        title=parsed_title,
                        artist=parsed_artist,
                        duration_ms=int(video.get("duration", 0) * 1000) if video.get("duration") else None,
                        source="youtube",
                        source_url=video.get("url") or f"https://youtube.com/watch?v={video.get('id')}",
                        confidence=0.5  # YouTube results get lower confidence
                    ))
                    
                except json.JSONDecodeError:
                    continue
                    
        except Exception as e:
            logger.warning(f"YouTube search failed: {e}")
        
        return results
    
    def _get_youtube_preview(self, artist: str, title: str) -> Optional[str]:
        """Get YouTube URL for preview."""
        try:
            import subprocess
            
            query = f"{artist} - {title} official"
            cmd = [
                "yt-dlp",
                f"ytsearch1:{query}",
                "--get-url",
                "--no-warnings",
                "-f", "bestaudio"
            ]
            
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            url = proc.stdout.strip()
            
            if url and url.startswith("http"):
                return url
                
        except Exception as e:
            logger.warning(f"Failed to get YouTube preview: {e}")
        
        return None
    
    def _download_ytdlp(self, query: str, output_dir: Path, music: bool = False) -> Optional[Path]:
        """Download audio using yt-dlp."""
        import subprocess
        
        search_prefix = "ytsearch1:" if not music else "https://music.youtube.com/search?q="
        
        output_template = str(output_dir / "%(title)s.%(ext)s")
        
        cmd = [
            "yt-dlp",
            f"{search_prefix}{query}" if not music else f"ytsearch1:{query} site:music.youtube.com",
            "-x",  # Extract audio
            "--audio-format", "wav",
            "--audio-quality", YTDLP_QUALITY,
            "-o", output_template,
            "--no-playlist",
            "--no-warnings"
        ]
        
        try:
            _proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            # Find the downloaded file
            for f in output_dir.glob("*.wav"):
                if f.stat().st_mtime > (datetime.now().timestamp() - 60):
                    return f
            
            # Check for other formats that might have been downloaded
            for ext in ["mp3", "m4a", "opus", "webm"]:
                for f in output_dir.glob(f"*.{ext}"):
                    if f.stat().st_mtime > (datetime.now().timestamp() - 60):
                        return f
                        
        except subprocess.TimeoutExpired:
            logger.error("yt-dlp download timed out")
        except Exception as e:
            logger.error(f"yt-dlp download failed: {e}")
        
        return None
    
    def _download_soundcloud(self, query: str, output_dir: Path) -> Optional[Path]:
        """Download from SoundCloud using yt-dlp."""
        import subprocess
        
        output_template = str(output_dir / "%(title)s.%(ext)s")
        
        cmd = [
            "yt-dlp",
            f"scsearch1:{query}",
            "-x",
            "--audio-format", "wav",
            "-o", output_template,
            "--no-warnings"
        ]
        
        try:
            _proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            for f in output_dir.glob("*.wav"):
                if f.stat().st_mtime > (datetime.now().timestamp() - 60):
                    return f
                    
        except Exception as e:
            logger.warning(f"SoundCloud download failed: {e}")
        
        return None
    
    # =========================================================================
    # Helper Methods
    # =========================================================================
    
    def _determine_track_type(self, title: str, artists: List[Dict]) -> str:
        """Determine if track is original, remix, collab, etc."""
        title_lower = title.lower()
        
        if any(kw in title_lower for kw in ["remix", "rmx", "rework", "bootleg", "edit"]):
            return "remix"
        
        if any(kw in title_lower for kw in ["feat.", "feat ", "ft.", "ft ", "featuring"]):
            return "collab"
        
        if len(artists) > 1:
            return "collab"
        
        return "original"
    
    def _parse_youtube_title(self, title: str) -> tuple:
        """Parse YouTube title into artist and track name."""
        # Common patterns:
        # "Artist - Track Name"
        # "Artist - Track Name (Official Video)"
        # "Track Name by Artist"
        
        # Remove common suffixes
        for suffix in ["(Official Video)", "(Official Audio)", "(Lyrics)", "(Music Video)", 
                       "[Official Video]", "[Official Audio]", "(Audio)", "(HD)", "(HQ)"]:
            title = title.replace(suffix, "").strip()
        
        # Try "Artist - Track" pattern
        if " - " in title:
            parts = title.split(" - ", 1)
            return parts[0].strip(), parts[1].strip()
        
        # Try "Track by Artist" pattern
        if " by " in title.lower():
            parts = re.split(r'\s+by\s+', title, flags=re.IGNORECASE)
            if len(parts) == 2:
                return parts[1].strip(), parts[0].strip()
        
        # Fallback: whole title as track name
        return "Unknown", title
    
    def _fuzzy_match(self, needle: str, haystack: str) -> bool:
        """Simple fuzzy matching."""
        needle = needle.lower().strip()
        haystack = haystack.lower().strip()
        
        if needle in haystack or haystack in needle:
            return True
        
        # Check word overlap
        needle_words = set(needle.split())
        haystack_words = set(haystack.split())
        overlap = needle_words & haystack_words
        
        return len(overlap) >= min(2, len(needle_words))
    
    def _dedupe_results(self, results: List[TrackResult]) -> List[TrackResult]:
        """Remove duplicate tracks, keeping highest confidence."""
        seen = {}
        
        for r in results:
            key = f"{r.artist.lower()}:{r.title.lower()}"
            # Normalize key
            key = re.sub(r'[^\w:]', '', key)
            
            if key not in seen or r.confidence > seen[key].confidence:
                seen[key] = r
        
        return list(seen.values())
    
    def _apply_hints(self, results: List[TrackResult], hints: str) -> List[TrackResult]:
        """Boost confidence of tracks matching hints."""
        hints_lower = hints.lower()
        hint_words = set(hints_lower.split())
        
        for r in results:
            # Check title match
            title_lower = r.title.lower()
            if any(word in title_lower for word in hint_words):
                r.confidence = min(1.0, r.confidence + 0.3)
            
            # Check for specific keywords
            if "white label" in hints_lower and "white" in title_lower:
                r.confidence = min(1.0, r.confidence + 0.2)
            
            if "remix" in hints_lower and r.track_type == "remix":
                r.confidence = min(1.0, r.confidence + 0.2)
            
            # Check genre hints
            for genre in r.genres:
                if genre.lower() in hints_lower:
                    r.confidence = min(1.0, r.confidence + 0.1)
        
        return results
    
    def _guess_section_hint(self, title: str) -> str:
        """Guess which section has the good bit based on title."""
        title_lower = title.lower()
        
        if any(kw in title_lower for kw in ["drop", "bass", "heavy", "banger"]):
            return "DROP 🔥"
        
        if any(kw in title_lower for kw in ["vocal", "sing", "voice"]):
            return "VOCALS 🎤"
        
        if any(kw in title_lower for kw in ["intro", "opening"]):
            return "INTRO"
        
        if any(kw in title_lower for kw in ["outro", "end"]):
            return "OUTRO"
        
        if any(kw in title_lower for kw in ["breakdown", "break"]):
            return "BREAKDOWN"
        
        # Default: assume the main hook is in the chorus/drop
        return "MAIN HOOK"


# Singleton instance
_track_finder = None

def get_track_finder() -> TrackFinder:
    global _track_finder
    if _track_finder is None:
        _track_finder = TrackFinder()
    return _track_finder
