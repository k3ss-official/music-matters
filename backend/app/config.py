"""
Music Matters - Unified Configuration
Merges configuration from all three repos into one powerful system.
"""

import os
from pathlib import Path
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    # Application
    APP_NAME: str = "Music Matters"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8010
    RELOAD: bool = True

    # Paths
    MUSIC_LIBRARY: Path = Path.home() / "Music Matters"
    CACHE_DIR: Path = Path.home() / ".cache" / "music-matters"
    TEMP_DIR: Path = Path.home() / ".cache" / "music-matters" / "temp"
    # HuggingFace model cache — redirect to SSD to keep boot drive free.
    # Set HF_HOME env var to override (or change this default).
    HF_HOME: Path = Path("/Volumes/MLX/cache")

    @property
    def resolved_downloads_dir(self) -> Path:
        return (self.MUSIC_LIBRARY / "downloads").expanduser()

    @property
    def resolved_stems_dir(self) -> Path:
        return (self.MUSIC_LIBRARY / "stems").expanduser()

    @property
    def resolved_loops_dir(self) -> Path:
        return (self.MUSIC_LIBRARY / "loops").expanduser()

    @property
    def resolved_projects_dir(self) -> Path:
        return (self.MUSIC_LIBRARY / "projects").expanduser()

    # Audio Processing
    SAMPLE_RATE: int = 44100
    BIT_DEPTH: int = 24
    AUDIO_FORMAT: str = "wav"

    # Demucs (Stem Separation)
    DEMUCS_MODEL: str = "htdemucs_6s"  # 6-stem model
    DEMUCS_DEVICE: str = "mps"  # mps=Apple Silicon, cuda=NVIDIA, cpu=fallback
    DEMUCS_SHIFTS: int = 1  # Quality vs speed (1=fast, 2+=better)
    DEMUCS_STEMS: List[str] = field(
        default_factory=lambda: ["drums", "bass", "vocals", "guitar", "piano", "other"]
    )

    # Sampling
    SAMPLE_BAR_OPTIONS: List[int] = field(default_factory=lambda: [4, 8, 16, 32, 64])
    DEFAULT_SAMPLE_BARS: int = 16
    LOOP_BAR_LENGTHS: List[int] = field(default_factory=lambda: [4, 8, 16, 32])

    # Search & Download
    AUDIO_SOURCES: List[str] = field(
        default_factory=lambda: ["youtube_music", "youtube", "soundcloud", "bandcamp"]
    )
    YTDLP_FORMAT: str = "bestaudio/best"
    YTDLP_QUALITY: str = "0"  # 0 = best

    # API Keys (Optional but recommended)
    SPOTIFY_CLIENT_ID: Optional[str] = None
    SPOTIFY_CLIENT_SECRET: Optional[str] = None
    DISCOGS_TOKEN: Optional[str] = None
    MUSICBRAINZ_USER_AGENT: str = "MusicMatters/2.0"

    # Analysis
    MIN_BPM: int = 60
    MAX_BPM: int = 200
    ENABLE_SOTA_ANALYSIS: bool = True  # Advanced structure analysis
    ENABLE_FINGERPRINTING: bool = True

    # Performance
    MAX_CONCURRENT_JOBS: int = 3
    JOB_TIMEOUT: int = 600  # 10 minutes
    ENABLE_CACHE: bool = True
    CACHE_TTL: int = 86400  # 24 hours

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True
        extra = "ignore"


# Section names for output organization
SECTION_NAMES = {
    "intro": "Intro",
    "verse": "Verse",
    "chorus": "Chorus",
    "buildup": "Buildup",
    "drop": "Drop",
    "breakdown": "Breakdown",
    "bridge": "Bridge",
    "outro": "Outro",
}

# Camelot Wheel for harmonic mixing (24 keys)
CAMELOT_WHEEL = {
    # Minor keys (A column)
    "Abm": "1A",
    "Ebm": "2A",
    "Bbm": "3A",
    "Fm": "4A",
    "Cm": "5A",
    "Gm": "6A",
    "Dm": "7A",
    "Am": "8A",
    "Em": "9A",
    "Bm": "10A",
    "F#m": "11A",
    "C#m": "12A",
    # Major keys (B column)
    "B": "1B",
    "F#": "2B",
    "Db": "3B",
    "Ab": "4B",
    "Eb": "5B",
    "Bb": "6B",
    "F": "7B",
    "C": "8B",
    "G": "9B",
    "D": "10B",
    "A": "11B",
    "E": "12B",
    # Alternate notations
    "G#m": "1A",
    "D#m": "2A",
    "A#m": "3A",
    "Gb": "2B",
    "C#": "3B",
    "G#": "4B",
    "D#": "5B",
    "A#": "6B",
}


def get_compatible_keys(camelot: str) -> List[str]:
    """
    Get harmonically compatible keys for DJ mixing.
    Returns list of Camelot codes that mix well with the input key.
    """
    if not camelot or len(camelot) < 2:
        return []

    try:
        num = int(camelot[:-1])
        letter = camelot[-1].upper()
    except (ValueError, IndexError):
        return []

    compatible = []

    # Same key (perfect match)
    compatible.append(camelot)

    # +1 semitone (energy boost)
    next_num = num % 12 + 1
    compatible.append(f"{next_num}{letter}")

    # -1 semitone (energy drop)
    prev_num = (num - 2) % 12 + 1
    compatible.append(f"{prev_num}{letter}")

    # Relative major/minor (same notes, different feel)
    other_letter = "B" if letter == "A" else "A"
    compatible.append(f"{num}{other_letter}")

    # +7 semitones (energy boost mixing)
    boost_num = (num + 6) % 12 + 1
    compatible.append(f"{boost_num}{letter}")

    return compatible


@dataclass
class TrackOutput:
    """Complete output structure for a processed track."""

    artist: str
    title: str
    year: Optional[int] = None

    # Analysis results
    bpm: float = 0.0
    key: str = ""
    camelot: str = ""
    duration: float = 0.0

    # File paths
    root_dir: Path = field(default_factory=Path)
    full_track: Optional[Path] = None
    stems: Dict[str, Path] = field(default_factory=dict)
    sections: Dict[str, Path] = field(default_factory=dict)
    loops: Dict[int, Dict[str, List[Path]]] = field(default_factory=dict)
    samples: List[Path] = field(default_factory=list)

    # Metadata
    structure: List[Dict[str, Any]] = field(default_factory=list)
    fingerprint: Optional[str] = None

    @property
    def folder_name(self) -> str:
        """Generate sanitized folder name."""
        name = f"{self.artist} - {self.title}"
        if self.year:
            name += f" ({self.year})"
        # Sanitize for filesystem
        for char in '<>:"/\\|?*':
            name = name.replace(char, "")
        return name.strip()

    @property
    def compatible_keys(self) -> List[str]:
        """Get compatible keys for mixing."""
        return get_compatible_keys(self.camelot)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "artist": self.artist,
            "title": self.title,
            "year": self.year,
            "bpm": self.bpm,
            "key": self.key,
            "camelot": self.camelot,
            "duration": self.duration,
            "compatible_keys": self.compatible_keys,
            "folder_name": self.folder_name,
            "root_dir": str(self.root_dir),
            "full_track": str(self.full_track) if self.full_track else None,
            "stems": {k: str(v) for k, v in self.stems.items()},
            "sections": {k: str(v) for k, v in self.sections.items()},
            "loops": {
                str(bar): {
                    section: [str(p) for p in paths]
                    for section, paths in sections.items()
                }
                for bar, sections in self.loops.items()
            },
            "samples": [str(p) for p in self.samples],
            "structure": self.structure,
            "fingerprint": self.fingerprint,
        }


# Initialize directories on import
def init_directories():
    """Create necessary directories."""
    settings = Settings()
    settings.MUSIC_LIBRARY.mkdir(parents=True, exist_ok=True)
    settings.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    settings.resolved_downloads_dir.mkdir(parents=True, exist_ok=True)
    settings.resolved_stems_dir.mkdir(parents=True, exist_ok=True)
    settings.resolved_loops_dir.mkdir(parents=True, exist_ok=True)
    settings.resolved_projects_dir.mkdir(parents=True, exist_ok=True)


# Create global settings instance
settings = Settings()
init_directories()

# Legacy constants for backwards compatibility with service modules
# -- Paths --
DOWNLOADS_DIR = settings.resolved_downloads_dir
STEMS_DIR = settings.resolved_stems_dir
LOOPS_DIR = settings.resolved_loops_dir
PROJECTS_DIR = settings.resolved_projects_dir
SAMPLES_DIR = (settings.MUSIC_LIBRARY / "samples").expanduser()
TEMP_DIR = settings.TEMP_DIR.expanduser()
DATA_DIR = settings.MUSIC_LIBRARY.expanduser()

# -- Audio --
SAMPLE_RATE = settings.SAMPLE_RATE
AUDIO_FORMAT = settings.AUDIO_FORMAT

# -- Demucs --
DEMUCS_MODEL = settings.DEMUCS_MODEL
DEMUCS_STEMS = settings.DEMUCS_STEMS
DEMUCS_DEVICE = settings.DEMUCS_DEVICE
DEMUCS_SHIFTS = settings.DEMUCS_SHIFTS
DEMUCS_OVERLAP = 0.25

# -- Search / Download --
YTDLP_OPTIONS: dict = {}
AUDIO_SOURCES = settings.AUDIO_SOURCES

# -- Sampling --
DEFAULT_SAMPLE_BARS = settings.DEFAULT_SAMPLE_BARS
SAMPLE_BAR_OPTIONS = settings.SAMPLE_BAR_OPTIONS
MIN_SAMPLE_BARS = 4
MAX_SAMPLE_BARS = 64

# -- Energy analysis --
ENERGY_HOP_LENGTH = 512
ENERGY_FRAME_LENGTH = 2048
MIN_SECTION_LENGTH_SECONDS = 8
SECTION_TYPES = ["intro", "verse", "chorus", "breakdown", "drop", "bridge", "outro"]

# -- API keys & rate limits --
SPOTIFY_CLIENT_ID = settings.SPOTIFY_CLIENT_ID or ""
SPOTIFY_CLIENT_SECRET = settings.SPOTIFY_CLIENT_SECRET or ""
DISCOGS_TOKEN = settings.DISCOGS_TOKEN or ""
MUSICBRAINZ_RATE_LIMIT = 1.0
DISCOGS_RATE_LIMIT = 1.0
SPOTIFY_RATE_LIMIT = 0.5
METADATA_CACHE_TTL = 86400
SEARCH_CACHE_TTL = 3600
