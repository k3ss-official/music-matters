# 🌊 Windsurf AI Coder - Music Matters v2.0 Context

## ⚠️ CRITICAL: Repository Has Been Completely Restructured

**Date:** December 12, 2025  
**Change:** 3 repositories merged into 1 unified platform  
**Status:** ✅ All changes committed and pushed to main branch

---

## 🚨 What You Need to Know

### **If You Have Cached/Old Code:**

**STOP and refresh your context immediately!**

The `music-matters` repository you may have cached is **completely different** now. We've merged:

1. `music-matters` (original)
2. `dj-library-tool` 
3. `dj-sample-discovery`

Into ONE unified codebase with:
- ✅ New directory structure
- ✅ Merged services
- ✅ Unified configuration
- ✅ Production-ready frontend
- ✅ Complete documentation

**Your old context is obsolete. Please fetch the latest from:**
```
git clone https://github.com/k3ss-official/music-matters.git
git checkout main
```

---

## 📊 Current Repository State

### **Commit Status:**
```
Branch: main
Latest Commit: ff08025
Status: All changes pushed
Pull Requests: All merged (#2)
Old Repos: Archived
```

### **Repository URL:**
```
https://github.com/k3ss-official/music-matters
```

### **What's in the Repo NOW:**
```
music-matters/
├── backend/                 Backend services (FastAPI)
│   ├── app/
│   │   ├── services/       Organized by function (search, analysis, etc.)
│   │   ├── api/routes/     Unified API routes
│   │   ├── config.py       Unified configuration
│   │   └── main.py         FastAPI application
│   ├── demo_server.py      Quick demo (no dependencies)
│   └── requirements.txt    Python dependencies
│
├── frontend/                React + TypeScript UI
│   ├── dist/               Production build (ready to deploy)
│   ├── src/                Source code
│   └── package.json        Node dependencies
│
└── docs/                    8 markdown documentation files
    ├── README.md
    ├── MERGE_HISTORY.md    ← Read this for full merger details
    ├── WINDSURF_CONTEXT.md ← This file
    ├── ROADMAP.md
    ├── QUICKSTART.md
    ├── DEPLOYMENT.md
    ├── GENSPARK_DEPLOY_INSTRUCTIONS.md
    └── DEMO_STATUS.md
```

---

## 🎯 Quick Context: What Happened

### **Before (3 Separate Repos):**
- `music-matters`: Pipeline orchestration, job queue (FastAPI)
- `dj-library-tool`: Search, GRAB workflow, Camelot wheel (FastAPI)
- `dj-sample-discovery`: SOTA analysis, fingerprinting (Flask)

### **After (Unified):**
- ONE repo with ALL features
- FastAPI backend (Flask converted)
- Organized service structure
- Production-ready frontend
- 68 files (down from 163)
- ~8K LOC (down from ~10K)
- Zero duplication

---

## 🔧 New Backend Structure

### **Services Directory (`backend/app/services/`):**

```python
services/
├── search/                  # Multi-source search (dj-library-tool)
│   ├── metadata_service.py  # MusicBrainz, Spotify, Discogs
│   ├── download_service.py  # yt-dlp integration
│   └── track_finder.py      # Multi-source track finding
│
├── analysis/                # Audio analysis (dj-sample-discovery)
│   ├── audio_analyzer.py    # BPM, key, structure detection
│   ├── harmonic_mixer.py    # Camelot wheel, mashup scoring
│   └── sota_analyzer.py     # SOTA structure analysis
│
├── processing/              # Audio processing (both)
│   ├── audio_processor.py   # Main processor (dj-library-tool)
│   ├── stem_separator.py    # Demucs 6-stem separation
│   └── sample_extractor.py  # Sample extraction (dj-sample-discovery)
│
├── fingerprint/             # Audio fingerprinting (dj-sample-discovery)
│   └── audio_fingerprint.py # Similarity detection
│
├── export/                  # DAW export (dj-sample-discovery)
│   └── daw_exporter.py      # Rekordbox, Serato, M3U
│
├── library.py              # Library management (music-matters)
├── pipeline.py             # Pipeline orchestration (music-matters)
└── registry.py             # Service registry (music-matters)
```

### **API Routes (`backend/app/api/routes/`):**

```python
routes/
├── search.py         # Multi-source search endpoints
├── analysis.py       # SOTA analysis, BPM/key detection
├── processing.py     # GRAB pipeline, stem separation
├── export.py         # DAW export endpoints
├── fingerprint.py    # Audio fingerprinting
├── library.py        # Library management
├── jobs.py           # Job queue status
├── ingest.py         # Track ingestion
└── status.py         # Health checks
```

### **Configuration (`backend/app/config.py`):**

All settings unified:
- Application config (name, version, debug)
- Server settings (host, port)
- Paths (library, cache, temp)
- Demucs settings (model, device)
- Search sources (YouTube, Spotify, etc.)
- API keys (Spotify, Discogs - optional)
- Analysis settings (BPM range, SOTA enabled)
- Performance (concurrent jobs, timeouts, caching)

---

## 🎨 Frontend Structure

### **Current State:**
```
frontend/
├── src/
│   ├── App.tsx             # Simplified production UI
│   ├── components/         # Moved to _unused/ for now
│   ├── hooks/              # Audio player, theme, etc.
│   ├── services/
│   │   └── api.ts          # Unified API client
│   ├── types.ts            # Merged type definitions
│   └── _unused/            # Advanced components (preserved)
│       ├── App-full.tsx    # Full feature UI (for later)
│       ├── screens/        # Search, Results, Grabbed screens
│       ├── components/     # SampleCard, TrackList, etc.
│       └── shared/         # Shared components
│
├── dist/                   # Production build (54 KB gzipped)
│   ├── index.html
│   └── assets/             # Optimized JS/CSS
│
└── package.json            # Merged dependencies
```

**Why simplified?**
- Merged 3 repos with different component structures
- TypeScript compatibility issues across repos
- Simplified `App.tsx` for fast deployment
- All advanced features preserved in `_unused/`
- Can be restored and refactored later

---

## 📦 Dependencies

### **Python (`backend/requirements.txt`):**
```
fastapi>=0.104.0           # Web framework
uvicorn[standard]>=0.24.0  # ASGI server
librosa>=0.10.0            # Audio analysis
# demucs>=4.0.0            # Stem separation (requires separate install)
yt-dlp>=2023.10.0          # Download service
musicbrainzngs>=0.7.1      # MusicBrainz API
spotipy>=2.23.0            # Spotify API
python-discogs-client      # Discogs API
```

### **Node.js (`frontend/package.json`):**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.x",
    "wavesurfer.js": "^7.4.0"
  },
  "devDependencies": {
    "vite": "^5.4.21",
    "typescript": "^5.x",
    "tailwindcss": "^3.x",
    "@tauri-apps/api": "^1.5.0"
  }
}
```

---

## 🚀 How to Work with This Repo

### **1. Clone Fresh (Important!)**
```bash
# If you have old music-matters cached, DELETE IT
rm -rf music-matters

# Clone fresh
git clone https://github.com/k3ss-official/music-matters.git
cd music-matters
git checkout main
```

### **2. Backend Setup**
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run demo server (no Demucs needed)
python3 demo_server.py

# OR run full server
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

### **3. Frontend Setup**
```bash
cd frontend

# Install dependencies
npm install

# Development
npm run dev

# Production build
npm run build
# → Output: dist/ (54 KB gzipped)
```

---

## 🎯 Key Files to Understand

### **Must Read (In Order):**
1. `README.md` - Project overview
2. `MERGE_HISTORY.md` - **Detailed merger documentation**
3. `WINDSURF_CONTEXT.md` - This file (AI coder context)
4. `backend/app/config.py` - Unified configuration
5. `backend/app/main.py` - FastAPI application entry
6. `frontend/src/App.tsx` - Current production UI

### **For Development:**
- `QUICKSTART.md` - 2-minute local setup
- `ROADMAP.md` - Future features and priorities
- `backend/app/services/` - All backend logic
- `backend/app/api/routes/` - All API endpoints

### **For Deployment:**
- `DEPLOYMENT.md` - Full deployment guide
- `GENSPARK_DEPLOY_INSTRUCTIONS.md` - Genspark Pro specific
- `frontend/dist/` - Production build (ready to deploy)

---

## 🧠 Important Context for AI Coders

### **What Changed:**

1. **Backend Framework:**
   - ❌ Flask (dj-sample-discovery)
   - ✅ FastAPI (unified)

2. **Directory Structure:**
   - ❌ Flat services (`app/services/*.py`)
   - ✅ Organized by function (`app/services/search/`, `analysis/`, etc.)

3. **Configuration:**
   - ❌ Multiple config files
   - ✅ One unified `config.py`

4. **Frontend:**
   - ❌ 3 different UI approaches
   - ✅ Simplified production UI (advanced features in `_unused/`)

5. **API Endpoints:**
   - ❌ Different routes in each repo
   - ✅ Unified routes under `/api/`

### **What's the Same:**

1. **Core Features:**
   - ✅ All features from all 3 repos preserved
   - ✅ Multi-source search (MusicBrainz, Spotify, YouTube)
   - ✅ GRAB pipeline (download → analyze → separate → loops)
   - ✅ SOTA analysis
   - ✅ Camelot wheel
   - ✅ DAW export

2. **Technology Stack:**
   - ✅ Python 3.10+
   - ✅ React + TypeScript
   - ✅ Demucs for stem separation
   - ✅ librosa for audio analysis

---

## 📍 API Endpoints (Unified)

**Base URL:** `http://localhost:8010/api`

### **Search & Metadata:**
```
POST   /api/search              # Multi-source search
GET    /api/search/artists      # Artist search
GET    /api/artist/{name}/tracks  # Artist's tracks
```

### **Processing:**
```
POST   /api/grab                # Start GRAB pipeline
GET    /api/grab/{job_id}       # Job status
POST   /api/process             # Process existing file
```

### **Analysis:**
```
GET    /api/analysis/sota/{track_id}  # SOTA structure
POST   /api/analysis/bpm              # BPM detection
POST   /api/analysis/key              # Key detection
POST   /api/analysis/mashup           # Mashup scoring
```

### **Export:**
```
GET    /api/export/rekordbox/{track_id}  # Rekordbox format
GET    /api/export/serato/{track_id}     # Serato format
GET    /api/export/m3u/{track_id}        # M3U playlist
```

### **Library:**
```
GET    /api/library             # List all tracks
GET    /api/library/{track_id}  # Track details
DELETE /api/library/{track_id}  # Delete track
```

### **System:**
```
GET    /api/health              # Health check
GET    /api/info                # App info
GET    /api/jobs                # All jobs
```

**Full API docs:** `http://localhost:8010/docs` (Swagger UI)

---

## 🔄 Git Workflow

### **Current State:**
```bash
# Check status
git status
# → Should show: "nothing to commit, working tree clean"

# Latest commits
git log --oneline -10
# → All merger commits visible

# Branches
git branch -a
# → main (current)
# → origin/main (up to date)
```

### **Making Changes:**
```bash
# Always pull first
git pull origin main

# Create feature branch
git checkout -b feature/your-feature

# Make changes, commit
git add .
git commit -m "feat: your feature"

# Push
git push origin feature/your-feature

# Create PR on GitHub
```

---

## 🎯 Development Priorities

### **Immediate (This Week):**
1. ✅ Merge complete (DONE)
2. ✅ Production build (DONE)
3. ✅ Documentation (DONE)
4. 🔄 Deploy frontend (Cloudflare Pages)
5. ⏳ Restore advanced UI components from `_unused/`
6. ⏳ Add comprehensive tests

### **Short Term (Next 2 Weeks):**
1. UI/UX polish (animations, transitions)
2. Advanced waveform player
3. Keyboard shortcuts
4. Theme switcher
5. Desktop app (Tauri)

### **Medium Term (Next Month):**
1. AI recommendations
2. Semantic audio search
3. Cloud sync
4. Mobile companion app

**Full roadmap:** See `ROADMAP.md`

---

## 💡 Tips for AI Coders

### **When Working on Backend:**
- Services are organized by function (`services/search/`, `analysis/`, etc.)
- Use `config.py` for all settings (NO hardcoded values)
- Follow FastAPI patterns (async/await, dependency injection)
- Add type hints (Python 3.10+ syntax)
- Update API routes in `api/routes/`

### **When Working on Frontend:**
- Current production UI is simplified (`App.tsx`)
- Advanced components are in `_unused/` (can be restored)
- Use TypeScript (types in `types.ts`)
- API client is in `services/api.ts`
- Build with `npm run build` before testing deployment

### **When Adding Features:**
- Check `ROADMAP.md` for priorities
- Update relevant documentation
- Add tests (we need these!)
- Follow existing patterns
- Update API docs (Swagger will auto-update)

### **When Debugging:**
- Check `backend/demo_server.py` for quick testing
- Use FastAPI `/docs` for API testing
- Frontend errors: Check browser console
- Backend errors: Check terminal output

---

## ✅ Final Checklist for AI Coders

Before you start coding, confirm:

- [ ] I've cloned/pulled the latest from `main` branch
- [ ] I've read `MERGE_HISTORY.md` (understand what changed)
- [ ] I've read `README.md` (understand the project)
- [ ] I understand the new directory structure
- [ ] I know where to find services (`backend/app/services/`)
- [ ] I know where to find API routes (`backend/app/api/routes/`)
- [ ] I've run `git log` to see recent commits
- [ ] I've checked `ROADMAP.md` for priorities
- [ ] I understand this is a merged repo (not original music-matters)
- [ ] **I will NOT use any cached/old code from previous repos**

---

## 🚨 Common Pitfalls to Avoid

### ❌ **DON'T:**
- Use old cached code from `music-matters`, `dj-library-tool`, or `dj-sample-discovery`
- Import from `app.core` (use `app.config` now)
- Use Flask patterns (this is FastAPI now)
- Hardcode values (use `config.py`)
- Mix up old and new API routes
- Assume old file locations

### ✅ **DO:**
- Pull latest from main before starting
- Read `MERGE_HISTORY.md` for context
- Follow new directory structure
- Use unified configuration
- Check API docs at `/docs`
- Ask questions if structure is unclear

---

## 📞 Need Help?

1. **Read the docs first:**
   - `MERGE_HISTORY.md` - What changed
   - `README.md` - Project overview
   - `QUICKSTART.md` - Local setup
   - `ROADMAP.md` - Future plans

2. **Check the code:**
   - `backend/app/config.py` - Configuration
   - `backend/app/main.py` - App entry point
   - `backend/app/services/` - Business logic
   - `frontend/src/App.tsx` - UI

3. **API documentation:**
   - `http://localhost:8010/docs` (when running)

4. **GitHub:**
   - Issues: https://github.com/k3ss-official/music-matters/issues
   - Discussions: https://github.com/k3ss-official/music-matters/discussions

---

## 🎉 You're All Set!

You now have full context on:
- ✅ What changed (3 repos merged)
- ✅ Current structure (organized by function)
- ✅ What's committed (everything is pushed)
- ✅ How to work with the repo
- ✅ Development priorities

**Welcome to Music Matters v2.0! Happy coding! 🎧🚀**

---

**Last Updated:** December 12, 2025  
**Branch:** main  
**Status:** ✅ All changes committed and pushed  
**Repository:** https://github.com/k3ss-official/music-matters
