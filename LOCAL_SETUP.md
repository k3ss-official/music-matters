# Music Matters - Local Setup Guide

## Prerequisites

**System:**
- macOS (M4 Mac recommended)
- Python 3.11+
- Node.js 22+
- Git

**Installed:**
- Homebrew
- ffmpeg (`brew install ffmpeg`)

---

## Quick Start (5 minutes)

### 1. Clone the repo

```bash
cd ~/Projects  # or wherever you keep projects
git clone https://github.com/k3ss-official/music-matters.git
cd music-matters
git checkout mvp-build
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install BeatNet (for beat detection)
pip install BeatNet

# Install additional deps
pip install soundfile

# Create .env file
cat > .env << 'EOF'
# API Keys (optional for MVP)
MUSICBRAINZ_USER_AGENT=MusicMatters/1.0
SPOTIFY_CLIENT_ID=your_id_here
SPOTIFY_CLIENT_SECRET=your_secret_here

# Paths
OUTPUT_DIR=~/Sound_Bank
CACHE_DIR=~/.music_matters_cache

# M4 Optimization
PYTORCH_ENABLE_MPS_FALLBACK=1
EOF

# Start backend
python -m app.main
```

**Backend should start on http://localhost:8000**

### 3. Frontend Setup (new terminal)

```bash
cd ~/Projects/music-matters/frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

**Frontend should start on http://localhost:5173**

### 4. Open in browser

```
http://localhost:5173
```

---

## Testing the MVP

### Test Flow:

1. **Search for a track**
   - Enter "Artist - Track" or paste YouTube URL
   - Click SEARCH
   - Click GRAB on a result

2. **Wait for analysis** (~15-30 seconds)
   - Backend downloads track
   - Detects BPM and beats
   - Generates waveform data

3. **Set a loop**
   - Click on waveform to set start point
   - Press `4` (4 beats), `8` (8 beats), or `16` (16 beats)
   - Green loop region appears

4. **Play and adjust**
   - Press `Space` to play/pause
   - Press `L` to enable loop
   - Use arrow keys to move loop left/right

5. **Adjust stems** (left panel)
   - Move faders to adjust stem levels
   - Click `S` to solo a stem
   - Click `M` to mute a stem
   - Try presets: DRUMS, NO VOCALS, ACAPELLA

6. **Save loop** (right panel)
   - Click SAVE LOOP
   - Loop appears in Hot Cues
   - Click hot cue to load it

7. **Export**
   - Select FULL MIX or STEMS
   - (Optional) Select DAW target
   - Click EXPORT LOOP
   - Check `~/Sound_Bank/` for output

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `I` | Set Loop IN |
| `O` | Set Loop OUT |
| `L` | Toggle Loop ON/OFF |
| `1` | 1 beat loop |
| `2` | 2 beat loop |
| `4` | 4 beat loop |
| `8` | 8 beat loop |
| `6` | 16 beat loop |
| `3` | 32 beat loop |
| `←` | Move loop left (1 beat) |
| `→` | Move loop right (1 beat) |

---

## Troubleshooting

### Backend won't start

**Error: `ModuleNotFoundError: No module named 'app'`**

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

**Error: `BeatNet not found`**

```bash
pip install BeatNet
```

**Error: `ffmpeg not found`**

```bash
brew install ffmpeg
```

### Frontend won't start

**Error: `Cannot find module`**

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### CORS errors in browser

Make sure backend is running on `http://localhost:8000` and frontend on `http://localhost:5173`.

Check `backend/app/main.py` has CORS enabled:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Beat detection fails

**Fallback to librosa:**

BeatNet might fail on some tracks. The backend automatically falls back to librosa.

Check logs for:
```
BeatNet failed, falling back to librosa
```

### Stem separation is slow

**Expected:** 30-60 seconds per track on M4 Mac.

**M4 GPU acceleration:**

Check if PyTorch is using MPS (Metal Performance Shaders):

```python
import torch
print(torch.backends.mps.is_available())  # Should be True
```

If False, reinstall PyTorch:

```bash
pip uninstall torch
pip install torch torchvision torchaudio
```

---

## Development

### Backend Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app
│   ├── config.py               # Configuration
│   ├── api/
│   │   └── routes/
│   │       ├── search.py       # Track search
│   │       ├── processing.py   # GRAB workflow
│   │       ├── loop.py         # Loop extraction (NEW)
│   │       └── status.py       # Health check
│   └── services/
│       ├── search/
│       │   ├── download_service.py
│       │   ├── metadata_service.py
│       │   └── track_finder.py
│       ├── analysis/
│       │   └── audio_analyzer.py
│       └── processing/
│           ├── beat_detector.py      # BeatNet (NEW)
│           ├── loop_extractor.py     # Loop extraction (NEW)
│           ├── stem_separator.py
│           └── sample_extractor.py
└── requirements.txt
```

### Frontend Structure

```
frontend/
├── src/
│   ├── App.tsx                 # Main app (REBUILT)
│   ├── components/
│   │   ├── SearchPanel.tsx     # Search UI (NEW)
│   │   ├── WaveformView.tsx    # Waveform + playback (NEW)
│   │   ├── NeuralMixPanel.tsx  # Stem control (NEW)
│   │   ├── LoopControlsPanel.tsx  # Loop controls (NEW)
│   │   ├── HotCuesPanel.tsx    # Hot cues (NEW)
│   │   └── ExportPanel.tsx     # Export UI (NEW)
│   └── api.ts                  # API client
└── package.json
```

### Adding a new feature

1. **Backend:** Add route in `backend/app/api/routes/`
2. **Frontend:** Add component in `frontend/src/components/`
3. **Wire up:** Call backend API from frontend component
4. **Test:** Run locally and verify
5. **Commit:** `git add . && git commit -m "feat: description"`
6. **Push:** `git push origin mvp-build`

---

## Next Steps

### Phase 1 (MVP) - Current

- [x] Frontend UI (search, waveform, loop controls, stems, hot cues, export)
- [ ] Backend integration (beat detection, loop extraction, stem export)
- [ ] Local testing with real tracks
- [ ] Bug fixes and polish

### Phase 1.1 (Polish)

- [ ] Better waveform rendering (frequency colors)
- [ ] Real-time stem preview (audio mixing)
- [ ] Drag-to-adjust loop boundaries
- [ ] Zoom in/out on waveform
- [ ] Beat grid adjustment (manual override)

### Phase 1.2 (DAW Integration)

- [ ] FL Studio project generation (.flp)
- [ ] Ableton Live Set generation (.als)
- [ ] Logic Pro project generation (.logicx)
- [ ] Maschine group generation (.ngrp)
- [ ] Auto-detect DAW paths
- [ ] Auto-open DAW after export

### Phase 2 (Semantic Search)

- [ ] "Find bass sounds" search
- [ ] Sound bank indexing
- [ ] Similarity matching
- [ ] Audio fingerprinting

---

## Support

**Issues:** https://github.com/k3ss-official/music-matters/issues  
**Branch:** `mvp-build`  
**Docs:** This file

---

**Built with ❤️ for DJs and Producers**

*Music Matters MVP - Capture the sound in your head* 🎧
