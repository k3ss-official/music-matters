"""
Audio Download Service
Uses yt-dlp to download audio from YouTube Music, YouTube, SoundCloud, Bandcamp
"""
import os
import re
import logging
import hashlib
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass
import subprocess
import json

import yt_dlp

from config import (
    DOWNLOADS_DIR, TEMP_DIR, YTDLP_OPTIONS, AUDIO_SOURCES,
    SAMPLE_RATE, AUDIO_FORMAT
)

logger = logging.getLogger(__name__)


@dataclass
class DownloadResult:
    """Result of a download operation"""
    success: bool
    file_path: Optional[Path] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    duration: Optional[float] = None
    source: Optional[str] = None
    url: Optional[str] = None
    error: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return {
            'success': self.success,
            'file_path': str(self.file_path) if self.file_path else None,
            'title': self.title,
            'artist': self.artist,
            'duration': self.duration,
            'source': self.source,
            'url': self.url,
            'error': self.error
        }


class DownloadService:
    """Service for downloading audio tracks from various sources"""
    
    def __init__(self):
        self.downloads_dir = DOWNLOADS_DIR
        self.temp_dir = TEMP_DIR
        
    def _get_safe_filename(self, title: str, artist: str) -> str:
        """Generate a safe filename from title and artist"""
        # Combine artist and title
        name = f"{artist} - {title}" if artist else title
        
        # Remove invalid characters
        name = re.sub(r'[<>:"/\\|?*]', '', name)
        name = re.sub(r'\s+', ' ', name).strip()
        
        # Truncate if too long
        if len(name) > 200:
            name = name[:200]
        
        return name
    
    def _search_youtube(self, query: str, source: str = 'youtube') -> Optional[str]:
        """Search YouTube/YouTube Music for a track and return the URL"""
        search_prefix = {
            'youtube_music': 'ytsearch1:',
            'youtube': 'ytsearch1:',
            'soundcloud': 'scsearch1:',
        }
        
        prefix = search_prefix.get(source, 'ytsearch1:')
        search_query = f"{prefix}{query}"
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'default_search': 'ytsearch',
        }
        
        # For YouTube Music, add specific options
        if source == 'youtube_music':
            ydl_opts['extractor_args'] = {'youtube': {'player_client': ['web']}}
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                result = ydl.extract_info(search_query, download=False)
                
                if result and 'entries' in result and result['entries']:
                    entry = result['entries'][0]
                    return entry.get('url') or entry.get('webpage_url')
                elif result and result.get('webpage_url'):
                    return result['webpage_url']
                    
        except Exception as e:
            logger.error(f"Search error for {source}: {e}")
        
        return None
    
    def download_track(
        self,
        artist: str,
        title: str,
        url: Optional[str] = None,
        preferred_source: Optional[str] = None
    ) -> DownloadResult:
        """
        Download a track by artist/title or URL
        
        If URL is provided, downloads directly.
        Otherwise, searches for the track across configured sources.
        """
        search_query = f"{artist} {title}"
        safe_filename = self._get_safe_filename(title, artist)
        output_path = self.downloads_dir / f"{safe_filename}.wav"
        
        # Check if already downloaded
        if output_path.exists():
            logger.info(f"Track already downloaded: {output_path}")
            # Get duration
            duration = self._get_audio_duration(output_path)
            return DownloadResult(
                success=True,
                file_path=output_path,
                title=title,
                artist=artist,
                duration=duration,
                source='cache'
            )
        
        # If URL provided, use it directly
        if url:
            return self._download_from_url(url, output_path, title, artist)
        
        # Otherwise, search across sources
        sources = AUDIO_SOURCES.copy()
        if preferred_source and preferred_source in sources:
            sources.remove(preferred_source)
            sources.insert(0, preferred_source)
        
        for source in sources:
            logger.info(f"Searching {source} for: {search_query}")
            found_url = self._search_youtube(search_query, source)
            
            if found_url:
                result = self._download_from_url(found_url, output_path, title, artist, source)
                if result.success:
                    return result
        
        return DownloadResult(
            success=False,
            title=title,
            artist=artist,
            error="Track not found on any source"
        )
    
    def _download_from_url(
        self,
        url: str,
        output_path: Path,
        title: str,
        artist: str,
        source: str = 'direct'
    ) -> DownloadResult:
        """Download audio from a specific URL"""
        temp_output = self.temp_dir / f"{output_path.stem}_temp"
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': str(temp_output),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'wav',
                'preferredquality': '0',
            }],
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'postprocessor_args': [
                '-ar', str(SAMPLE_RATE),
                '-acodec', 'pcm_s24le',  # 24-bit WAV
            ],
        }
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                
                # Find the downloaded file
                downloaded_file = None
                for ext in ['.wav', '.webm', '.m4a', '.mp3', '.opus']:
                    potential = Path(str(temp_output) + ext)
                    if potential.exists():
                        downloaded_file = potential
                        break
                
                if not downloaded_file:
                    # Try without extension
                    for f in self.temp_dir.glob(f"{temp_output.name}*"):
                        downloaded_file = f
                        break
                
                if downloaded_file:
                    # Convert to WAV if needed
                    if downloaded_file.suffix.lower() != '.wav':
                        self._convert_to_wav(downloaded_file, output_path)
                        downloaded_file.unlink()  # Remove temp file
                    else:
                        downloaded_file.rename(output_path)
                    
                    duration = self._get_audio_duration(output_path)
                    
                    return DownloadResult(
                        success=True,
                        file_path=output_path,
                        title=info.get('title', title),
                        artist=info.get('artist') or info.get('uploader') or artist,
                        duration=duration,
                        source=source,
                        url=url
                    )
                else:
                    return DownloadResult(
                        success=False,
                        title=title,
                        artist=artist,
                        error="Download completed but file not found"
                    )
                    
        except Exception as e:
            logger.error(f"Download error: {e}")
            return DownloadResult(
                success=False,
                title=title,
                artist=artist,
                url=url,
                error=str(e)
            )
    
    def _convert_to_wav(self, input_path: Path, output_path: Path):
        """Convert audio file to WAV format using ffmpeg"""
        cmd = [
            'ffmpeg', '-y', '-i', str(input_path),
            '-ar', str(SAMPLE_RATE),
            '-acodec', 'pcm_s24le',  # 24-bit
            '-ac', '2',  # Stereo
            str(output_path)
        ]
        
        try:
            subprocess.run(cmd, check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg conversion error: {e.stderr.decode()}")
            raise
    
    def _get_audio_duration(self, file_path: Path) -> Optional[float]:
        """Get duration of audio file in seconds"""
        try:
            cmd = [
                'ffprobe', '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'json',
                str(file_path)
            ]
            result = subprocess.run(cmd, capture_output=True, check=True)
            data = json.loads(result.stdout)
            return float(data['format']['duration'])
        except Exception as e:
            logger.error(f"Duration detection error: {e}")
            return None
    
    def download_batch(
        self,
        tracks: List[Dict],
        progress_callback=None
    ) -> List[DownloadResult]:
        """Download multiple tracks with progress reporting"""
        results = []
        total = len(tracks)
        
        for i, track in enumerate(tracks):
            artist = track.get('artist', '')
            title = track.get('title', '')
            url = track.get('url')
            
            result = self.download_track(artist, title, url)
            results.append(result)
            
            if progress_callback:
                progress_callback(i + 1, total, result)
        
        return results


# Singleton instance
_download_service = None

def get_download_service() -> DownloadService:
    global _download_service
    if _download_service is None:
        _download_service = DownloadService()
    return _download_service
