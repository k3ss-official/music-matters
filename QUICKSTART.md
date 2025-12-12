# 🚀 Music Matters v2.0 - Quick Start Guide

## ⚡ TL;DR - Get It Running in 2 Minutes

```bash
# 1. Clone the repo
git clone https://github.com/k3ss-official/music-matters.git
cd music-matters

# 2. Start backend (demo mode)
cd backend
pip install fastapi uvicorn pydantic pydantic-settings
python3 demo_server.py

# 3. In another terminal, start frontend
cd frontend
npm install
npm run dev

# 4. Open browser
# Frontend: http://localhost:5173
# Backend API: http://localhost:8010/docs
```

---

## 🎯 Full Setup (Production Mode)

### Prerequisites
- **Python 3.10+** (3.12 recommended)
- **Node.js 18+** (for frontend)
- **FFmpeg** (for audio processing)
- **~4GB disk space** (for Demucs models)

### Backend Setup

#### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

#### 2. Install Demucs (Stem Separation)
```bash
# For Apple Silicon (M1/M2/M3/M4)
pip install demucs

# For NVIDIA GPU
pip install demucs torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# For CPU only
pip install demucs
```

#### 3. Install yt-dlp (Download Service)
```bash
pip install yt-dlp
```

#### 4. Create Configuration
```bash
cp backend/.env.example backend/.env
# Edit .env with your settings
```

Example `.env`:
```bash
# Application
DEBUG=false
HOST=0.0.0.0
PORT=8010

# Paths
MUSIC_LIBRARY=/Users/yourname/Music Matters
CACHE_DIR=/Users/yourname/.cache/music-matters

# Demucs Settings
DEMUCS_MODEL=htdemucs_6s
DEMUCS_DEVICE=mps  # mps=Apple Silicon, cuda=NVIDIA, cpu=fallback
DEMUCS_SHIFTS=1

# Optional API Keys (for better metadata)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_secret
DISCOGS_TOKEN=your_discogs_token
```

#### 5. Run Backend
```bash
# Full production mode
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload

# OR demo mode (no dependencies needed)
python3 demo_server.py
```

---

### Frontend Setup

#### 1. Install Dependencies
```bash
cd frontend
npm install
```

#### 2. Configure API URL (if needed)
```bash
# Create .env.local
echo "VITE_API_URL=http://localhost:8010/api" > .env.local
```

#### 3. Run Frontend
```bash
npm run dev
```

The app will open at: **http://localhost:5173**

---

## 🎨 What You'll See

### Demo Mode (No Dependencies)
- ✅ Full UI/UX preview
- ✅ Mock track search (5 preset tracks)
- ✅ Simulated processing
- ✅ All components functional
- ❌ No real audio processing

### Production Mode (With Dependencies)
- ✅ Real YouTube/Spotify/SoundCloud downloads
- ✅ Actual Demucs stem separation (~90s per track)
- ✅ Real BPM/key detection
- ✅ SOTA structure analysis
- ✅ Loop & section generation
- ✅ DAW export (Rekordbox, Serato, M3U)

---

## 🔧 Common Issues & Fixes

### Issue: "Module not found: app.core"
**Fix**: Make sure you're on the latest main branch
```bash
git pull origin main
```

### Issue: Backend won't start
**Fix**: Install missing dependencies
```bash
pip install fastapi uvicorn pydantic pydantic-settings python-multipart httpx
```

### Issue: Frontend shows "Backend not connected"
**Fix**: 
1. Check backend is running: `curl http://localhost:8010/api/health`
2. Check CORS settings in `backend/app/main.py`
3. Try restarting both services

### Issue: Demucs is slow
**Fix**: 
- On Mac: Use `DEMUCS_DEVICE=mps` (Apple Silicon)
- On Windows/Linux with NVIDIA: Use `DEMUCS_DEVICE=cuda`
- Reduce quality: Set `DEMUCS_SHIFTS=1` (faster but lower quality)

### Issue: Out of disk space
**Fix**: 
- Demucs models take ~2GB
- Processed tracks take ~100MB each
- Clear cache: `rm -rf ~/.cache/music-matters`

---

## 🎯 Quick Test Commands

### Test Backend API
```bash
# Health check
curl http://localhost:8010/api/health

# Search tracks
curl -X POST http://localhost:8010/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"Disclosure"}'

# Get library
curl http://localhost:8010/api/library

# View API docs
open http://localhost:8010/docs
```

### Test Frontend
```bash
# Check it's running
curl http://localhost:5173

# Open in browser
open http://localhost:5173
```

---

## 🐳 Docker Setup (Alternative)

Coming soon! We'll provide a Docker Compose setup for one-command deployment.

---

## 📱 Desktop App (Tauri)

### Build Desktop App
```bash
cd frontend
npm install
npm run tauri:build
```

The installer will be in `frontend/src-tauri/target/release/bundle/`

---

## 🎵 First Track Workflow

### 1. Search for a Track
- Open UI at http://localhost:5173
- Enter artist/song name
- Click Search

### 2. GRAB the Track
- Click "GRAB" on any result
- Wait for processing (30-90 seconds)
- Watch real-time progress

### 3. Check Results
- Navigate to "Grabbed" screen
- See stems, sections, loops
- Play waveforms
- Export to DAW

---

## 🚀 Production Deployment

### For Personal Use
```bash
# Just run locally
cd backend && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8010
cd frontend && npm run build && npm run preview
```

### For Team/Server Use
- Set up Nginx reverse proxy
- Use systemd service for backend
- Serve frontend via Nginx static files
- Add SSL certificate (Let's Encrypt)
- Configure firewall rules

---

## 💡 Tips & Best Practices

### Performance
- Use SSD for `MUSIC_LIBRARY` and `CACHE_DIR`
- On Mac M-series: Always use `DEMUCS_DEVICE=mps`
- Process tracks in batches of 3-5 (set `MAX_CONCURRENT_JOBS`)

### Organization
- Let the app organize your tracks (it creates folders by artist/title/year)
- Use the library view to browse processed tracks
- Export playlists to your DAW regularly

### API Keys (Optional but Recommended)
- **Spotify**: Better metadata and search results
- **Discogs**: Additional metadata and cover art
- Both are free for personal use

Get API keys:
- Spotify: https://developer.spotify.com/dashboard
- Discogs: https://www.discogs.com/settings/developers

---

## 📚 Documentation

- **README.md** - Project overview
- **ROADMAP.md** - Future development plans
- **RUNNING.md** - Current running status
- **DEMO_STATUS.md** - Demo mode details
- **API Docs** - http://localhost:8010/docs (when running)

---

## 🆘 Need Help?

### GitHub Issues
https://github.com/k3ss-official/music-matters/issues

### Discussions
https://github.com/k3ss-official/music-matters/discussions

---

## 🎉 You're Ready!

Now go make some music! 🎧✨

**Music Matters v2.0 - Built by DJs, for DJs**
