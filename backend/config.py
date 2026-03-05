"""
DJ Sample Discovery - Configuration
Optimized for M4 Mini with 16GB RAM
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Base paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = Path(os.getenv('DJ_DATA_DIR', Path.home() / 'DJ_Samples'))
CACHE_DIR = DATA_DIR / '.cache'
TEMP_DIR = DATA_DIR / '.temp'
DOWNLOADS_DIR = DATA_DIR / 'downloads'
SAMPLES_DIR = DATA_DIR / 'samples'
STEMS_DIR = DATA_DIR / 'stems'

# Ensure directories exist
for dir_path in [DATA_DIR, CACHE_DIR, TEMP_DIR, DOWNLOADS_DIR, SAMPLES_DIR, STEMS_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# Server settings
HOST = os.getenv('DJ_HOST', '127.0.0.1')
PORT = int(os.getenv('DJ_PORT', 5555))
DEBUG = os.getenv('DJ_DEBUG', 'false').lower() == 'true'

# Audio settings
AUDIO_FORMAT = 'wav'
SAMPLE_RATE = 44100
BIT_DEPTH = 24  # 24-bit WAV
CHANNELS = 2  # Stereo

# Sample extraction settings
DEFAULT_SAMPLE_BARS = 16  # 16 bars default
MIN_SAMPLE_BARS = 4
MAX_SAMPLE_BARS = 64
SAMPLE_BAR_OPTIONS = [4, 8, 16, 32, 64]

# Energy analysis settings
ENERGY_HOP_LENGTH = 512
ENERGY_FRAME_LENGTH = 2048
MIN_SECTION_LENGTH_SECONDS = 8  # Minimum section length for detection

# Section detection types
SECTION_TYPES = ['intro', 'verse', 'chorus', 'breakdown', 'drop', 'bridge', 'outro']

# yt-dlp settings
YTDLP_OPTIONS = {
    'format': 'bestaudio/best',
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'wav',
        'preferredquality': '0',  # Best quality
    }],
    'outtmpl': str(DOWNLOADS_DIR / '%(title)s.%(ext)s'),
    'quiet': True,
    'no_warnings': True,
    'extract_flat': False,
}

# Audio sources priority (in order)
AUDIO_SOURCES = [
    'youtube_music',
    'youtube',
    'soundcloud',
    'bandcamp',
]

# Demucs settings
DEMUCS_MODEL = 'htdemucs_6s'  # 6-stem model: drums, bass, vocals, guitar, piano, other
DEMUCS_STEMS = ['drums', 'bass', 'vocals', 'guitar', 'piano', 'other']
DEMUCS_DEVICE = 'mps'  # Apple Silicon GPU acceleration
DEMUCS_SHIFTS = 1  # Number of random shifts for better quality (1-10, higher = better but slower)
DEMUCS_OVERLAP = 0.25  # Overlap between chunks for seamless separation

# API Keys (set via environment variables)
SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID', '')
SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET', '')
DISCOGS_TOKEN = os.getenv('DISCOGS_TOKEN', '')

# Rate limiting for APIs
MUSICBRAINZ_RATE_LIMIT = 1.0  # seconds between requests
DISCOGS_RATE_LIMIT = 1.0
SPOTIFY_RATE_LIMIT = 0.5

# Cache settings
METADATA_CACHE_TTL = 86400  # 24 hours
SEARCH_CACHE_TTL = 3600  # 1 hour

# Performance settings for M4 Mini
MAX_CONCURRENT_DOWNLOADS = 3
MAX_CONCURRENT_ANALYSIS = 2
DEMUCS_BATCH_SIZE = 1  # Process one track at a time to manage memory

# Logging
LOG_LEVEL = os.getenv('DJ_LOG_LEVEL', 'INFO')
LOG_FILE = DATA_DIR / 'dj_sampler.log'
