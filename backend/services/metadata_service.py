"""
Metadata Aggregation Service
Combines MusicBrainz, Discogs, and Spotify for comprehensive artist/track data
"""
import time
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime
from functools import lru_cache
from cachetools import TTLCache

import musicbrainzngs
import discogs_client
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

from config import (
    MUSICBRAINZ_RATE_LIMIT, DISCOGS_RATE_LIMIT, SPOTIFY_RATE_LIMIT,
    SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, DISCOGS_TOKEN,
    METADATA_CACHE_TTL, SEARCH_CACHE_TTL
)

logger = logging.getLogger(__name__)

# Initialize MusicBrainz
musicbrainzngs.set_useragent("DJ-Sample-Discovery", "1.0", "https://github.com/djsampler")

# Caches
artist_cache = TTLCache(maxsize=1000, ttl=METADATA_CACHE_TTL)
track_cache = TTLCache(maxsize=5000, ttl=METADATA_CACHE_TTL)
search_cache = TTLCache(maxsize=500, ttl=SEARCH_CACHE_TTL)


@dataclass
class TrackInfo:
    """Unified track information from all sources"""
    id: str
    title: str
    artist: str
    artist_id: str
    album: Optional[str] = None
    release_date: Optional[str] = None
    duration_ms: Optional[int] = None
    track_type: str = 'original'  # original, remix, collaboration, production
    bpm: Optional[float] = None
    key: Optional[str] = None
    genres: List[str] = None
    labels: List[str] = None
    producers: List[str] = None
    remixers: List[str] = None
    featuring: List[str] = None
    isrc: Optional[str] = None
    spotify_id: Optional[str] = None
    musicbrainz_id: Optional[str] = None
    discogs_id: Optional[str] = None
    youtube_url: Optional[str] = None
    soundcloud_url: Optional[str] = None
    bandcamp_url: Optional[str] = None
    cover_art_url: Optional[str] = None
    popularity: Optional[int] = None
    source: str = 'unknown'
    
    def __post_init__(self):
        if self.genres is None:
            self.genres = []
        if self.labels is None:
            self.labels = []
        if self.producers is None:
            self.producers = []
        if self.remixers is None:
            self.remixers = []
        if self.featuring is None:
            self.featuring = []
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class ArtistInfo:
    """Unified artist information"""
    id: str
    name: str
    aliases: List[str] = None
    genres: List[str] = None
    country: Optional[str] = None
    formed_year: Optional[int] = None
    image_url: Optional[str] = None
    spotify_id: Optional[str] = None
    musicbrainz_id: Optional[str] = None
    discogs_id: Optional[str] = None
    
    def __post_init__(self):
        if self.aliases is None:
            self.aliases = []
        if self.genres is None:
            self.genres = []
    
    def to_dict(self) -> Dict:
        return asdict(self)


class MetadataService:
    """Aggregates metadata from multiple music databases"""
    
    def __init__(self):
        self._last_mb_request = 0
        self._last_discogs_request = 0
        self._last_spotify_request = 0
        
        # Initialize Discogs client
        self.discogs = None
        if DISCOGS_TOKEN:
            try:
                self.discogs = discogs_client.Client(
                    'DJ-Sample-Discovery/1.0',
                    user_token=DISCOGS_TOKEN
                )
                logger.info("Discogs client initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize Discogs: {e}")
        
        # Initialize Spotify client
        self.spotify = None
        if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET:
            try:
                auth_manager = SpotifyClientCredentials(
                    client_id=SPOTIFY_CLIENT_ID,
                    client_secret=SPOTIFY_CLIENT_SECRET
                )
                self.spotify = spotipy.Spotify(auth_manager=auth_manager)
                logger.info("Spotify client initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize Spotify: {e}")
    
    def _rate_limit_mb(self):
        """Rate limit MusicBrainz requests"""
        elapsed = time.time() - self._last_mb_request
        if elapsed < MUSICBRAINZ_RATE_LIMIT:
            time.sleep(MUSICBRAINZ_RATE_LIMIT - elapsed)
        self._last_mb_request = time.time()
    
    def _rate_limit_discogs(self):
        """Rate limit Discogs requests"""
        elapsed = time.time() - self._last_discogs_request
        if elapsed < DISCOGS_RATE_LIMIT:
            time.sleep(DISCOGS_RATE_LIMIT - elapsed)
        self._last_discogs_request = time.time()
    
    def _rate_limit_spotify(self):
        """Rate limit Spotify requests"""
        elapsed = time.time() - self._last_spotify_request
        if elapsed < SPOTIFY_RATE_LIMIT:
            time.sleep(SPOTIFY_RATE_LIMIT - elapsed)
        self._last_spotify_request = time.time()
    
    def search_artist(self, query: str) -> List[ArtistInfo]:
        """Search for artists across all sources"""
        cache_key = f"artist_search:{query.lower()}"
        if cache_key in search_cache:
            return search_cache[cache_key]
        
        artists = []
        seen_names = set()
        
        # Search MusicBrainz
        try:
            self._rate_limit_mb()
            result = musicbrainzngs.search_artists(artist=query, limit=10)
            for artist in result.get('artist-list', []):
                name = artist.get('name', '').lower()
                if name not in seen_names:
                    seen_names.add(name)
                    artists.append(ArtistInfo(
                        id=f"mb:{artist.get('id')}",
                        name=artist.get('name'),
                        aliases=[a.get('name') for a in artist.get('alias-list', [])],
                        country=artist.get('country'),
                        musicbrainz_id=artist.get('id'),
                        genres=[t.get('name') for t in artist.get('tag-list', [])]
                    ))
        except Exception as e:
            logger.error(f"MusicBrainz artist search error: {e}")
        
        # Search Spotify
        if self.spotify:
            try:
                self._rate_limit_spotify()
                result = self.spotify.search(q=query, type='artist', limit=10)
                for artist in result.get('artists', {}).get('items', []):
                    name = artist.get('name', '').lower()
                    if name not in seen_names:
                        seen_names.add(name)
                        images = artist.get('images', [])
                        artists.append(ArtistInfo(
                            id=f"sp:{artist.get('id')}",
                            name=artist.get('name'),
                            genres=artist.get('genres', []),
                            image_url=images[0].get('url') if images else None,
                            spotify_id=artist.get('id')
                        ))
                    else:
                        # Merge Spotify data with existing entry
                        for a in artists:
                            if a.name.lower() == name:
                                a.spotify_id = artist.get('id')
                                images = artist.get('images', [])
                                if images and not a.image_url:
                                    a.image_url = images[0].get('url')
                                a.genres = list(set(a.genres + artist.get('genres', [])))
                                break
            except Exception as e:
                logger.error(f"Spotify artist search error: {e}")
        
        search_cache[cache_key] = artists
        return artists
    
    def get_artist_tracks(
        self,
        artist_name: str,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        track_types: Optional[List[str]] = None
    ) -> List[TrackInfo]:
        """
        Get all tracks by an artist with filtering options
        
        track_types: ['original', 'remix', 'collaboration', 'production']
        """
        tracks = []
        seen_titles = set()
        
        # Parse date filters
        date_from_dt = datetime.strptime(date_from, '%Y-%m-%d') if date_from else None
        date_to_dt = datetime.strptime(date_to, '%Y-%m-%d') if date_to else None
        
        # Search MusicBrainz for recordings
        try:
            self._rate_limit_mb()
            # First get artist ID
            artist_result = musicbrainzngs.search_artists(artist=artist_name, limit=1)
            if artist_result.get('artist-list'):
                mb_artist_id = artist_result['artist-list'][0]['id']
                mb_artist_name = artist_result['artist-list'][0]['name']
                
                # Get recordings
                self._rate_limit_mb()
                offset = 0
                limit = 100
                
                while True:
                    recordings = musicbrainzngs.browse_recordings(
                        artist=mb_artist_id,
                        limit=limit,
                        offset=offset,
                        includes=['releases', 'artist-credits']
                    )
                    
                    for rec in recordings.get('recording-list', []):
                        title = rec.get('title', '')
                        title_lower = title.lower()
                        
                        # Skip duplicates
                        if title_lower in seen_titles:
                            continue
                        
                        # Determine track type
                        track_type = self._determine_track_type(title, rec, mb_artist_name)
                        
                        # Apply track type filter
                        if track_types and track_type not in track_types:
                            continue
                        
                        # Get release date from releases
                        release_date = None
                        for release in rec.get('release-list', []):
                            if release.get('date'):
                                release_date = release['date']
                                break
                        
                        # Apply date filter
                        if release_date:
                            try:
                                # Handle partial dates
                                if len(release_date) == 4:
                                    track_date = datetime(int(release_date), 1, 1)
                                elif len(release_date) == 7:
                                    track_date = datetime.strptime(release_date, '%Y-%m')
                                else:
                                    track_date = datetime.strptime(release_date[:10], '%Y-%m-%d')
                                
                                if date_from_dt and track_date < date_from_dt:
                                    continue
                                if date_to_dt and track_date > date_to_dt:
                                    continue
                            except ValueError:
                                pass
                        
                        seen_titles.add(title_lower)
                        
                        # Extract featured artists
                        featuring = []
                        for credit in rec.get('artist-credit', []):
                            if isinstance(credit, dict) and 'artist' in credit:
                                credit_name = credit['artist'].get('name', '')
                                if credit_name.lower() != mb_artist_name.lower():
                                    featuring.append(credit_name)
                        
                        tracks.append(TrackInfo(
                            id=f"mb:{rec.get('id')}",
                            title=title,
                            artist=mb_artist_name,
                            artist_id=f"mb:{mb_artist_id}",
                            release_date=release_date,
                            duration_ms=rec.get('length'),
                            track_type=track_type,
                            featuring=featuring,
                            musicbrainz_id=rec.get('id'),
                            source='musicbrainz'
                        ))
                    
                    # Check if more results
                    if len(recordings.get('recording-list', [])) < limit:
                        break
                    offset += limit
                    self._rate_limit_mb()
                    
                    # Limit total results
                    if offset > 500:
                        break
                        
        except Exception as e:
            logger.error(f"MusicBrainz tracks error: {e}")
        
        # Enrich with Spotify data
        if self.spotify:
            try:
                self._rate_limit_spotify()
                result = self.spotify.search(q=f"artist:{artist_name}", type='track', limit=50)
                
                for item in result.get('tracks', {}).get('items', []):
                    title = item.get('name', '')
                    title_lower = title.lower()
                    
                    # Check if we already have this track
                    existing = None
                    for t in tracks:
                        if t.title.lower() == title_lower:
                            existing = t
                            break
                    
                    if existing:
                        # Enrich existing track
                        existing.spotify_id = item.get('id')
                        existing.popularity = item.get('popularity')
                        album = item.get('album', {})
                        if album.get('images'):
                            existing.cover_art_url = album['images'][0].get('url')
                        if not existing.release_date:
                            existing.release_date = album.get('release_date')
                    elif title_lower not in seen_titles:
                        # Add new track
                        seen_titles.add(title_lower)
                        
                        track_type = self._determine_track_type(title, item, artist_name)
                        if track_types and track_type not in track_types:
                            continue
                        
                        album = item.get('album', {})
                        release_date = album.get('release_date')
                        
                        # Apply date filter
                        if release_date:
                            try:
                                if len(release_date) == 4:
                                    track_date = datetime(int(release_date), 1, 1)
                                elif len(release_date) == 7:
                                    track_date = datetime.strptime(release_date, '%Y-%m')
                                else:
                                    track_date = datetime.strptime(release_date[:10], '%Y-%m-%d')
                                
                                if date_from_dt and track_date < date_from_dt:
                                    continue
                                if date_to_dt and track_date > date_to_dt:
                                    continue
                            except ValueError:
                                pass
                        
                        # Extract featured artists
                        featuring = []
                        for artist in item.get('artists', [])[1:]:
                            featuring.append(artist.get('name'))
                        
                        tracks.append(TrackInfo(
                            id=f"sp:{item.get('id')}",
                            title=title,
                            artist=artist_name,
                            artist_id=f"sp:{item.get('artists', [{}])[0].get('id')}",
                            album=album.get('name'),
                            release_date=release_date,
                            duration_ms=item.get('duration_ms'),
                            track_type=track_type,
                            featuring=featuring,
                            spotify_id=item.get('id'),
                            cover_art_url=album['images'][0].get('url') if album.get('images') else None,
                            popularity=item.get('popularity'),
                            source='spotify'
                        ))
                        
            except Exception as e:
                logger.error(f"Spotify tracks error: {e}")
        
        # Sort by release date (newest first)
        tracks.sort(key=lambda t: t.release_date or '0000', reverse=True)
        
        return tracks
    
    def _determine_track_type(self, title: str, track_data: dict, artist_name: str) -> str:
        """Determine if track is original, remix, collaboration, or production"""
        title_lower = title.lower()
        
        # Check for remix
        remix_keywords = ['remix', 'rmx', 'rework', 'edit', 'bootleg', 'flip', 'vip']
        for keyword in remix_keywords:
            if keyword in title_lower:
                return 'remix'
        
        # Check for collaboration indicators
        collab_indicators = [' feat ', ' feat.', ' ft ', ' ft.', ' featuring ', ' with ', ' x ', ' & ']
        for indicator in collab_indicators:
            if indicator in title_lower:
                return 'collaboration'
        
        # Check artist credits for collaboration
        if isinstance(track_data, dict):
            artists = track_data.get('artists', track_data.get('artist-credit', []))
            if isinstance(artists, list) and len(artists) > 1:
                return 'collaboration'
        
        # Check for production credit indicators
        prod_indicators = ['prod by', 'produced by', 'production']
        for indicator in prod_indicators:
            if indicator in title_lower:
                return 'production'
        
        return 'original'
    
    def search_tracks(self, query: str, limit: int = 20) -> List[TrackInfo]:
        """Search for tracks by title/query"""
        cache_key = f"track_search:{query.lower()}"
        if cache_key in search_cache:
            return search_cache[cache_key]
        
        tracks = []
        seen = set()
        
        # Search Spotify (usually has best results)
        if self.spotify:
            try:
                self._rate_limit_spotify()
                result = self.spotify.search(q=query, type='track', limit=limit)
                for item in result.get('tracks', {}).get('items', []):
                    key = f"{item.get('name', '').lower()}:{item.get('artists', [{}])[0].get('name', '').lower()}"
                    if key not in seen:
                        seen.add(key)
                        album = item.get('album', {})
                        tracks.append(TrackInfo(
                            id=f"sp:{item.get('id')}",
                            title=item.get('name'),
                            artist=item.get('artists', [{}])[0].get('name'),
                            artist_id=f"sp:{item.get('artists', [{}])[0].get('id')}",
                            album=album.get('name'),
                            release_date=album.get('release_date'),
                            duration_ms=item.get('duration_ms'),
                            track_type=self._determine_track_type(item.get('name', ''), item, ''),
                            spotify_id=item.get('id'),
                            cover_art_url=album['images'][0].get('url') if album.get('images') else None,
                            popularity=item.get('popularity'),
                            source='spotify'
                        ))
            except Exception as e:
                logger.error(f"Spotify track search error: {e}")
        
        search_cache[cache_key] = tracks
        return tracks


# Singleton instance
_metadata_service = None

def get_metadata_service() -> MetadataService:
    global _metadata_service
    if _metadata_service is None:
        _metadata_service = MetadataService()
    return _metadata_service
