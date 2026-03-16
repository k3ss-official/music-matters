# Music Matters v2.0 — Orchestrator Handover & Technical Summary

**Target Audience:** AI Technical Orchestrator  
**Project Objective:** Automate ingest → stem separation → loop prep for DJs/producers.  
**Stack Overview:** Python 3.12, FastAPI, Librosa, Demucs v4 (MPS), yt-dlp, React 18, Vite, TypeScript, TailwindCSS, Wavesurfer.js.

---

## 1. Project Genesis & Architecture

Music Matters v2.0 is a consolidation of three prior repositories: `music-matters` (orchestration), `dj-library-tool` (search/grab), and `dj-sample-discovery` (SOTA audio analysis). The monolithic merge created a unified platform with two distinct execution environments:

### Backend (Python/FastAPI)
The backend operates entirely on asynchronous local pipelines triggered by REST API calls. 
- **Core Pipeline ([backend/app/services/pipeline.py](file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/backend/app/services/pipeline.py))**: The central engine governing job states. It queues track processing utilizing an internal orchestrator ([PipelineOrchestrator](file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/backend/app/services/pipeline.py#146-835)).
- **Processing Stages**: 
  1. **Ingest/Download**: URL ingestion via `yt-dlp` (extracts native metadata, bypasses raw video IDs, converts to WAV). Local file uploading via standard multi-part forms.
  2. **Analysis (`librosa`)**: Calculates BPM, harmonic key, detects structure/transients.
  3. **Separation ([demucs](file:///Volumes/deep-1t/Users/k3ss/projects/music-matters/backend/app/services/processing/stem_separator.py#77-89))**: Yields 6-stem output (vocals, drums, bass, guitar, piano, other). Optimized for Apple Silicon MPS (`htdemucs_6s` model).
  4. **Loop Slicing**: Generates DAW-ready, quantized custom loop bars.
- **REST APIs**: Segmented cleanly via APIRouter into:
  - `/ingest` (File/URL ingestion workflows)
  - `/jobs` (Polling job progress states)
  - `/library` (Querying track metadata, deleting tracks)
  - `/audio` (Streaming raw audio buffers with `FileResponse` for frontend waveforms)
  - `/status` (Heartbeats)

### Frontend (React/Vite/TypeScript)
The frontend was totally rewritten from a basic vertically scrolling prototype to a rigid, dark-themed "Three-Zone Architecture" to mimic professional DAWs.

- **Zone 1: Left Sidebar**: 
    - `SearchIngest.tsx`: Allows file uploading or YouTube URL ingestion.
    - `QueuePanel.tsx`: Live-polls running backend jobs and shows dynamic progress bars.
    - `LibraryBrowser.tsx`: Organizes tracks into a tabbed list. Dynamically renders sources (YouTube vs Local) and allows native track deletion via a cascading API call (`DELETE /library/tracks/{trackId}`).
- **Zone 2: Centre Workspace**: 
    - `CentreWorkspace.tsx` & `WaveformCanvas.tsx`: Wraps `wavesurfer.js` utilizing `RegionsPlugin` to create draggable loop slices. It directly streams HTTP Range requests from `/api/audio/tracks/{trackId}`.
    - `LoopEditorToolbar.tsx`: Allows millimeter-precision block-nudging (`< 10ms >`) and beat-quantized looping operations automatically calculated against the backend's Librosa BPM detection.
- **Zone 3: Right Sidebar**: 
    - `AnalysisPanel.tsx`: Read-out for track metadata, harmonic key, and real FS paths.
    - `StemLanes.tsx`: Dynamically fetches Demucs' outputs from `/api/audio/stems/{trackId}/{stemName}`. Allows selective muting/playing of isolated stems.
    - `ExportPanel.tsx`: Triggers the `/loops/custom` API endpoint bridging the defined loop region with the selected stems.

---

## 2. Recent Implementations & Fixes

You are taking over immediately after a major UI and API normalization sprint. 

### What Was Just Done:
1. **Three-Zone UI Rebuild**: Wiped out the old `App.tsx` and refactored the entire UI into the isolated, typed components listed above (`SearchIngest`, `QueuePanel`, `LibraryBrowser`, `CentreWorkspace`, etc.).
2. **Audio Streaming Bug (`/api/audio/`)**: Fixed a critical frontend blocker where the waveform canvas rendered black because the backend wasn't serving audio. `backend/app/api/routes/audio.py` was created to serve `FileResponse` bytes, allowing Wavesurfer to compute headers.
3. **yt-dlp Metadata Parsing Bug**: On ingest, `pipeline.py` previously named downloaded YouTube tracks via their raw string (e.g. `watch?v=k5q...`). This was rewritten to `ydl.extract_info(source, download=False)` to inherently map true `track.title` and `track.artist`.
4. **Delete Track De-synchronization Bug**: The `Trash` icon on Library items was bubbled, causing fake 404 views. Added `stopPropagation()`, combined with a new `.delete_track()` method inside `pipeline.py` which unlinks the local file folder via `shutil.rmtree` and purges the in-memory Python registry seamlessly.

---

## 3. Immediate Priorities & Next Steps for the Orchestrator

When you resume execution, be mindful of the following:

- **State Syncing**: The `pipeline._tracks` store is currently held in volatile memory. There is no SQLite or Postgres persistence layer implemented yet. If Uvicorn restarts, the queue flushes. Integrating a local persistence DB (e.g., SQLite via SQLAlchemy) might be needed.
- **"Search" mode on Ingest**: Currently, the `SearchIngest.tsx` component stubs out standard text searches with an `alert('coming soon')`. It expects exact URL matches to route to `yt-dlp`. 
- **Stems vs Tracks Audio Fetching**: Stems are mapped inside `provenance` metadata. For newly ingested tracks, occasionally `stem_path_str` differs and relies on a hardcoded fallback inside `audio.py`. Ensure edge cases for Demucs un-separated tracks do not break the StemLane UI. 
- **Vite Proxy**: Frontend routing calls (`api.ts`) default to `/api/*` which proxies via Vite to `8010` (the FastAPI port). 
- **Agent Guidelines**: Comply intimately with `AGENTS.md`. Key rule: **NEVER commit stem artifacts or wav binaries.** And adhere to the rapid, no-padding, no-nonsense "Rae Ops" persona dictated by global user rules.

**Execution Environment:** `macOS M4 Mac mini`, Conda environment: `music-matters`.

**To Spin Up The Stack:**
```bash
# Terminal 1:
conda activate music-matters
cd backend && uvicorn app.main:app --reload --port 8010

# Terminal 2:
cd frontend && npm run dev
```
