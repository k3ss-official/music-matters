# 🎵 Music Matters — Working MVP

## ✅ What's Working Now

### **Backend (Python/FastAPI)**
- ✅ **Real BPM Detection** — Librosa beat tracking (not hardcoded anymore)
- ✅ **Real Key Detection** — Chromagram-based key estimation
- ✅ **Full Demucs Integration** — 6-stem separation with HPSS fallback
- ✅ **File Upload API** — Direct audio file uploads from frontend
- ✅ **YouTube Download** — yt-dlp integration for remote sources
- ✅ **Loop Generation** — 4-bar loops from stems
- ✅ **Job Tracking** — Async pipeline with 5 stages

### **Frontend (React/TypeScript)**
- ✅ **File Upload UI** — Drag & drop + file picker
- ✅ **URL Ingestion** — YouTube/SoundCloud links
- ✅ **Real-time Progress** — Job status polling
- ✅ **Loop Browser** — View and play generated loops
- ✅ **Search** — Track search functionality
- ✅ **Theme Switcher** — Light/dark mode

## 🚀 How to Use

### **Start the System**
```bash
# Terminal 1: Activate conda env
conda activate music

# Start backend API
uvicorn app.main:app --reload --port 8010

# Terminal 2: Start frontend (in frontend/ directory)
npm run dev
```

### **Access Points**
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8010
- **API Docs**: http://localhost:8010/docs

### **Upload Audio Files**
1. Open http://localhost:5173
2. Scroll to "Upload Audio File" section
3. **Drag & drop** your audio file OR click to browse
4. Watch the 5-stage pipeline process:
   - Ingest → Analysis → Separation → Loop Slicing → Project Assembly
5. View generated loops once complete

### **Supported Formats**
- MP3, WAV, FLAC, M4A, OGG
- YouTube/SoundCloud URLs
- Local file paths

### **Test with YouTube**
```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

## 📊 Pipeline Stages

1. **Ingest** — Download/copy audio to library
2. **Analysis** — Real BPM + key detection (Librosa)
3. **Separation** — Demucs 6-stem OR HPSS fallback
4. **Loop Slicing** — Generate 4-bar loops
5. **Project Assembly** — Create FL Studio scaffold

## 🔥 What Changed

### **Backend Improvements**
- Replaced hardcoded BPM=120/Key=C with real Librosa analysis
- Wired up full Demucs separation (tries Demucs first, falls back to HPSS)
- Added `/api/v1/jobs/upload` endpoint for file uploads
- Better error handling and progress reporting

### **Frontend Improvements**
- Added file upload component with drag & drop
- Wired up `uploadFile` API call
- Better UI feedback during processing

## 📁 Generated Files

After processing, check:
```bash
# Stems (6-stem Demucs or 3-stem HPSS)
/Volumes/hotblack-2tb/mm-files/stems/separated/{track-slug}/

# Loops (4-bar slices)
/Volumes/hotblack-2tb/mm-files/loops/generated/{track-slug}/

# Project scaffold
/Volumes/hotblack-2tb/mm-files/projects/{track-slug}/
```

## ⚡ Performance Notes

- **BPM Detection**: Analyzes first 120 seconds (fast)
- **Demucs Separation**: 3-5 minutes per track on M4 Mac (MPS accelerated)
- **HPSS Fallback**: ~10 seconds if Demucs fails
- **Total Pipeline**: 3-6 minutes for full track

## 🎯 Next Steps

- [ ] Add multi-length loop generation (1/2/8 bars)
- [ ] SQLite persistence (currently in-memory)
- [ ] Background workers (Celery/RQ)
- [ ] FL Studio template generation
- [ ] WebSocket progress updates
- [ ] Audio fingerprinting for deduplication

## 🐛 Known Issues

- Pipeline runs inline (blocks API on long jobs)
- No persistent storage (restart loses data)
- Demucs requires model download on first run
- Frontend doesn't show file upload progress bar

---

**Status**: Fully functional MVP. Upload your tracks and get real stems + loops! 🔥
