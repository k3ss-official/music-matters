# 🎧 Music Matters - SOTA Edition v2.0

**The Ultimate DJ & Producer Automation Platform**

> State-of-the-art music processing combining the best of track discovery, stem separation, harmonic mixing, and intelligent sampling. Built for M4 Mini with production-grade UI/UX.

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/k3ss-official/music-matters)
[![Python](https://img.shields.io/badge/python-3.10+-green.svg)](https://python.org)
[![React](https://img.shields.io/badge/react-18.2-blue.svg)](https://reactjs.org)
[![License](https://img.shields.io/badge/license-MIT-purple.svg)](LICENSE)

---

## 🚀 What's New in v2.0 - Unified Platform

This is a **complete merger** of three powerful DJ tools into one SOTA platform:

### Merged From:
1. **Music Matters** - Pipeline orchestration & library management
2. **DJ Library Tool** - Search → Preview → GRAB workflow
3. **DJ Sample Discovery** - SOTA analysis & intelligent sampling

### The Result:
✨ **ALL features from all three repos in one streamlined platform**

---

## ⚡ Core Features

### 🔍 **Multi-Source Track Discovery**
- Search across **MusicBrainz**, **Spotify**, **YouTube**
- Filter by artist, date range, track type (original/remix/collab)
- AI-powered result ranking
- 30-second previews

### 🧠 **SOTA Audio Analysis**
- **Self-similarity matrix** structure segmentation
- **Beat tracking** with downbeat detection
- Section classification (intro, verse, chorus, drop, bridge, outro)
- **BPM & key detection** using Krumhansl-Schmuckler profiles
- Energy profile mapping

### 🎹 **Harmonic Mixing (Camelot Wheel)**
- Full 24-key Camelot wheel mapping
- Compatible key suggestions for mixing:
  - Same key (perfect match)
  - ±1 semitone (smooth transitions)
  - Relative major/minor (mood change)
  - +7 semitones (energy boost)
- **Mashup potential scoring** with compatibility analysis

### 🎚️ **6-Stem Separation (Demucs)**
- **htdemucs_6s** model
- Stems: drums, bass, vocals, guitar, piano, other
- Apple M4 MPS acceleration
- HPSS fallback for systems without Demucs

### 🎛️ **Intelligent Sampling**
- Configurable sample length: 4, 8, 16, 32, 64 bars
- Section preference (drop, chorus, breakdown, etc.)
- Score-based sample point ranking:
  - Energy score
  - Beat alignment score
  - Silence avoidance score
  - Loop quality score

### 🔊 **Audio Fingerprinting**
- Spectral peak extraction
- Constellation map generation
- Multi-dimensional similarity scoring
- Duplicate detection
- Similar sample finder

### 📁 **DAW Export**
- **Rekordbox XML**: Full metadata, cue points, colors
- **Serato**: CSV and M3U8 for Smart Crates
- **M3U8**: Universal playlist format
- **JSON**: Complete backup/transfer

### 🎵 **Loop & Section Generation**
- Bar-aligned loop extraction (4, 8, 16, 32 bars)
- Automatic section detection & extraction
- Crossfade-ready tails
- DAW-ready 24-bit WAV format

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Music Matters v2.0                          │
├─────────────────────────────────────────────────────────────────┤
│  React + TypeScript Frontend (Tauri Desktop)                    │
│  ├── SearchPanel (Multi-source artist/track search)             │
│  ├── TrackList (Selection & batch processing)                   │
│  ├── SOTAPanel (Camelot wheel, structure visualization)         │
│  ├── MashupScorer (Compatibility calculator)                    │
│  ├── SampleCard (Waveform, play/grab/discard)                   │
│  └── ExtractionSettings (Bars, stems, sections)                 │
├─────────────────────────────────────────────────────────────────┤
│  FastAPI Backend (Python)                                        │
│  ├── Search Service (MusicBrainz, Discogs, Spotify)             │
│  ├── Download Service (yt-dlp multi-source)                     │
│  ├── SOTA Analyzer (Structure, beats, harmony)                  │
│  ├── Audio Analyzer (BPM, key, energy)                          │
│  ├── Sample Extractor (Intelligent point selection)             │
│  ├── Stem Separator (Demucs htdemucs_6s)                        │
│  ├── Harmonic Mixer (Camelot wheel, mashup scoring)             │
│  ├── Audio Fingerprint (Similarity, duplicates)                 │
│  ├── DAW Exporter (Rekordbox, Serato, M3U)                      │
│  └── Library Manager (File system tracking)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Installation

### Prerequisites
- Python 3.10+
- Node.js 18+
- FFmpeg (for audio processing)
- ~4GB disk space for Demucs models

### Quick Start

```bash
# Clone repository
git clone https://github.com/k3ss-official/music-matters.git
cd music-matters

# Backend setup
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install demucs  # Separate install for Demucs

# Frontend setup
cd ../frontend
npm install

# Start the platform
# Terminal 1: Backend
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload

# Terminal 2: Frontend
cd frontend
npm run dev

# Access at http://localhost:5173
```

---

## ⚙️ Configuration

Create `backend/.env`:

```env
# Library location
MUSIC_LIBRARY=~/Music Matters

# Demucs settings (M4 optimized)
DEMUCS_MODEL=htdemucs_6s
DEMUCS_DEVICE=mps  # mps=Apple Silicon, cuda=NVIDIA, cpu=fallback

# Optional: Enhanced search
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
DISCOGS_TOKEN=your_token

# Features
ENABLE_SOTA_ANALYSIS=true
ENABLE_FINGERPRINTING=true

# Performance
MAX_CONCURRENT_JOBS=3
```

---

## 🎯 Workflow

### 1. **Search & Discover**
- Enter artist name or track query
- Filter by date range and track type
- Browse results with metadata previews

### 2. **Analyze & Process**
- Select tracks for processing
- Configure: bars, stems, sections, loops
- Real-time progress tracking

### 3. **SOTA Analysis**
- View structure breakdown
- Check Camelot key & compatible keys
- Calculate mashup potential

### 4. **Export & Use**
- Grab samples to library
- Export playlists to Rekordbox/Serato
- Open in DAW with full stems & loops

---

## 📊 API Endpoints

### Search
- `POST /api/search/artist` - Search by artist
- `POST /api/search/tracks` - Search by query

### Analysis
- `POST /api/analysis/analyze` - Full audio analysis
- `GET /api/analysis/camelot/{key}` - Compatible keys
- `POST /api/analysis/mashup-score` - Mashup compatibility

### Processing
- `POST /api/processing/process` - Full processing pipeline
- `GET /api/processing/job/{id}` - Job status
- `POST /api/processing/extract-sample` - Smart sampling

### Export
- `POST /api/export/rekordbox` - Rekordbox XML
- `POST /api/export/serato` - Serato crate
- `POST /api/export/m3u` - M3U playlist

### Fingerprinting
- `POST /api/fingerprint/generate` - Generate fingerprint
- `POST /api/fingerprint/compare` - Compare tracks
- `POST /api/fingerprint/find-similar` - Find similar

---

## 📈 Performance (M4 Mini 16GB)

| Operation | Time |
|-----------|------|
| Track Search | ~2s |
| SOTA Analysis (5min track) | ~15s |
| BPM/Key Detection | ~5s |
| 6-Stem Separation | 30-60s |
| Sample Extraction | ~2s |
| Loop Generation | ~2s |
| Fingerprint | ~3s |
| **Full Pipeline** | **~90s** |

---

## 🛠️ Tech Stack

### Backend
- **FastAPI** - Async web framework
- **librosa** - Audio analysis
- **Demucs** - Stem separation
- **yt-dlp** - Download service
- **musicbrainzngs, spotipy, discogs-client** - Metadata APIs

### Frontend
- **React 18** + TypeScript
- **Tailwind CSS** - Styling
- **wavesurfer.js** - Waveform visualization
- **Tauri** - Desktop wrapper

---

## 🎯 What Makes This Special

### 🔥 **Unified Platform**
All features from three specialized tools in one cohesive experience

### ⚡ **Production Grade**
- Type-safe TypeScript frontend
- Async FastAPI backend
- Real-time progress tracking
- Error handling & recovery

### 🎨 **Beautiful UI/UX**
- Modern gradient design
- Smooth animations
- Responsive layout
- Intuitive workflows

### 🚀 **Performance Optimized**
- M4 Apple Silicon acceleration
- Efficient caching
- Background processing
- Minimal latency

---

## 🤝 Contributing

This is a **merged repository** from three separate projects. See git history for original contributions.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🙏 Credits

- **Demucs** by Facebook Research
- **yt-dlp** maintainers
- **librosa** for audio analysis
- **MusicBrainz**, **Discogs**, **Spotify** APIs
- Original repos: `dj-library-tool`, `dj-sample-discovery`, `music-matters`

---

**Made with ❤️ for DJs and Producers**

*Built for M4 Mini • Powered by AI • SOTA Quality • Production Ready*

---

## 🔮 Roadmap

- [ ] Cloud sync for sample library
- [ ] Ableton/FL Studio direct integration
- [ ] AI-powered "similar artists" discovery
- [ ] Batch processing queue
- [ ] Mobile companion app
- [ ] Plugin versions (VST/AU)
- [ ] Collaborative playlists
- [ ] Live streaming integration

---

**🎧 Music Matters v2.0 - The Ultimate DJ & Producer Automation Platform**
