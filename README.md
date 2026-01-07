# 🎧 Music Matters - Loop Extraction Tool

**Find the sound in your head. Grab it. Use it.**

A streamlined tool for DJs and producers to extract loops from any track with full stems, beat-aligned and ready for your DAW.

---

## 🎯 What It Does

### Input:
- Search by artist/track name
- OR paste a direct URL (YouTube, SoundCloud, Bandcamp)

### Output:
```
~/Sound_Bank/Artist - Track/
├── loop_001.wav              # Full mix loop
└── stems/                    # Optional 6-stem separation
    ├── drums.wav
    ├── bass.wav
    ├── vocals.wav
    ├── guitar.wav
    ├── piano.wav
    └── other.wav
```

---

## ⚡ Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- FFmpeg
- ~4GB disk space for Demucs models (if using stem separation)

### Installation

```bash
# Clone the repo
git clone https://github.com/k3ss-official/music-matters.git
cd music-matters

# Backend setup
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install

# Start backend (Terminal 1)
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8010

# Start frontend (Terminal 2)
cd frontend
npm run dev

# Open http://localhost:5173
```

---

## 🎛️ How To Use

1. **Search or Paste URL**
   - Enter artist/track name OR paste YouTube/SoundCloud URL

2. **Analyze Track**
   - Automatic BPM detection and beatgrid mapping

3. **Select Loop**
   - Waveform display with beat markers
   - Click to set loop start position
   - Press number key (1-9) for bar length:
     - `1` = 1 bar
     - `4` = 4 bars
     - `8` = 8 bars
     - `16` = 16 bars
     - etc.

4. **Export**
   - Choose "Full Mix" or "Stems (6)"
   - Saves to `~/Sound_Bank/`

---

## 🔧 Features

### Phase 1 (Current - MVP)
- ✅ Multi-source search (MusicBrainz, Spotify, YouTube)
- ✅ Direct URL input
- ✅ BPM and beatgrid detection
- ✅ Waveform visualization
- ✅ Interactive loop selection
- ✅ Beat-aligned loop extraction
- ✅ 6-stem separation (Demucs)
- ✅ Export to sound bank

### Phase 2 (Future)
- ⏳ Semantic search ("find bass sounds")
- ⏳ Boolean search ("kick AND snare")
- ⏳ Search across sound bank
- ⏳ Audio fingerprinting and similarity matching

---

## ⚙️ Configuration

Create `backend/.env`:

```env
# Sound bank location
SOUND_BANK=~/Sound_Bank

# Demucs settings (for stem separation)
DEMUCS_MODEL=htdemucs_6s
DEMUCS_DEVICE=mps  # mps=Apple Silicon, cuda=NVIDIA, cpu=fallback

# Optional: Enhanced search
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

---

## 🏗️ Architecture

```
music-matters/
├── backend/
│   ├── app/
│   │   ├── services/
│   │   │   ├── search/
│   │   │   │   ├── download_service.py    # yt-dlp wrapper
│   │   │   │   ├── metadata_service.py    # Search APIs
│   │   │   │   └── track_finder.py        # Track discovery
│   │   │   ├── analysis/
│   │   │   │   └── audio_analyzer.py      # BPM/beatgrid
│   │   │   └── processing/
│   │   │       ├── audio_processor.py     # Audio processing
│   │   │       ├── stem_separator.py      # Demucs integration
│   │   │       └── sample_extractor.py    # Loop extraction
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── search.py              # Search endpoints
│   │   │       ├── processing.py          # Processing endpoints
│   │   │       └── status.py              # Health check
│   │   ├── core/
│   │   │   └── settings.py                # Configuration
│   │   └── main.py                        # FastAPI app
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── SearchInput.tsx            # Search/URL input
    │   │   ├── Waveform.tsx               # Waveform display
    │   │   └── LoopControls.tsx           # Loop selection UI
    │   └── api.ts                         # API client
    └── package.json
```

---

## 🛠️ Tech Stack

**Backend:**
- FastAPI - Async web framework
- librosa - Audio analysis
- Demucs - Stem separation
- yt-dlp - Download service
- MusicBrainz, Spotify APIs - Metadata

**Frontend:**
- React 18 + TypeScript
- Tailwind CSS
- wavesurfer.js - Waveform visualization
- Web Audio API - Playback

---

## 📝 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/search` | POST | Search for tracks |
| `/api/process` | POST | Download and analyze track |
| `/api/loop/extract` | POST | Extract loop (full or stems) |
| `/api/audio/{file}` | GET | Stream audio files |

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🙏 Credits

- **Demucs** by Facebook Research
- **yt-dlp** maintainers
- **librosa** for audio analysis
- **MusicBrainz**, **Spotify** APIs

---

**Made with ❤️ for DJs and Producers**

*Built for speed • Optimized for Apple Silicon • Local-first*
