# Music Matters — STATUS
> Last updated: **2026-03-24 20:50 UTC** · Session: Antigravity (Opus 4.6)

---

## Session Work Log (chronological)

### Phase 0.1 — Job Persistence (SQLite)
- Added `jobs` table to `DatabaseService` (`backend/app/services/db.py`)
- `save_job()`, `load_all_jobs()`, `delete_job()` methods
- `PipelineOrchestrator` now persists job state after every stage transition
- On server restart: hydrates jobs from DB, marks interrupted ones as `failed`

### Phase 0.2 — SSE Real-Time Progress Stream
- Implemented `subscribe()`, `unsubscribe()`, `_broadcast()` on PipelineOrchestrator (`backend/app/services/pipeline.py`)
- Created SSE endpoint `GET /api/jobs/{job_id}/stream` (`backend/app/api/routes/stream.py`)
- Registered stream router in `backend/app/api/router.py`
- Built frontend SSE client `frontend/src/services/sse.ts` (EventSource + camelCase mapping + auto-cleanup)

### Phase 0.3 — MVP Frontend Rewrite
- **Rewrote `App.tsx`** — 3-state flow: Upload → Processing → Workspace
- Stripped: LibraryBrowser, SearchIngest, QueuePanel, GeneratePanel, sidebar resize
- Kept: CentreWorkspace, AnalysisPanel, StemLanes, ExportPanel, ExportDialog, ShortcutLegend
- Added `ProcessingView` component (`frontend/src/components/ProcessingView.tsx`):
  - Stage cards with live status (icon, label, detail, progress%, checkmark)
  - Whimsical rotating remarks per stage (13 for separation alone)
  - Elapsed time counter
- Added **drag-and-drop** to upload zone (cyan glow, "Drop it!" text)
- Set `loopSlicing: false` — no auto loop generation (loops are manual via waveform)
- Fixed `uploadTrack()` to map camelCase→snake_case for backend Pydantic model

### Bug Fixes This Session
- **Polling recovery**: if SSE drops and job already completed, polls track status directly to unstick the processing view
- **camelCase→snake_case**: frontend was sending `loopSlicing` but backend expected `loop_slicing` — options were silently ignored
- **Installed `demucs-mlx` v1.4.3** — was missing from conda env, pipeline was falling through to HPSS (3 stems) instead of 6-stem Demucs
- **Added standard demucs (torch) fallback**: Tier 1.5 between demucs-mlx and HPSS, so separation never silently degrades to 3 stems

---

## Current State

### What Works ✅
- Upload view — file picker + drag-and-drop
- Processing view — stage cards, progress bar, whimsical remarks, elapsed timer
- Backend pipeline — ingest, analysis (BPM/key/beats), separation (now with demucs-mlx), project scaffold
- Workspace view — waveform, analysis panel, stem lanes, export dialog
- SQLite persistence — tracks, loops, jobs survive restarts
- SSE stream endpoint (backend) + SSE client (frontend)

### Known Bugs ❌
1. **Processing view stuck** — all stages show ✅ but view doesn't transition to workspace. Root cause: SSE stream may drop and polling fallback wasn't recovering correctly. Partially fixed (polling now checks track status directly) — needs validation on next upload.
2. **Stream router path conflict** — both `jobs.py` and `stream.py` use `prefix="/jobs"`. The `GET /{job_id}` in jobs.py may intercept `GET /{job_id}/stream`. Needs prefix change on stream router.

### Needs Validation 🔄
- `demucs-mlx` now installed — next upload should produce 6 stems (drums, bass, vocals, guitar, piano, other)
- `loop_slicing: false` now correctly mapped — next upload should skip auto-loop generation
- Backend needs restart to pick up new `demucs-mlx` package

---

## Architecture (current)

```
Frontend (React/Vite :5173)          Backend (FastAPI/Uvicorn :8010)
┌─────────────────────┐              ┌──────────────────────────┐
│ App.tsx              │              │ main.py                  │
│  ├─ Upload view      │──upload──→  │  ├─ /api/ingest/upload   │
│  ├─ ProcessingView   │──SSE─────→  │  ├─ /api/jobs/{id}/stream│
│  └─ Workspace view   │──REST───→   │  ├─ /api/library/tracks  │
│     ├─ CentreWS      │             │  └─ /api/export/*        │
│     ├─ AnalysisPanel  │             │                          │
│     ├─ StemLanes      │             │ PipelineOrchestrator     │
│     └─ ExportDialog   │             │  ├─ ingest → analysis   │
│                       │             │  ├─ separation (demucs)  │
│ services/             │             │  ├─ loop (optional)      │
│  ├─ api.ts            │             │  └─ project scaffold     │
│  └─ sse.ts            │             │                          │
└─────────────────────┘              │ SQLite (library.db)      │
                                     │  ├─ tracks table          │
                                     │  ├─ loops table           │
                                     │  └─ jobs table            │
                                     └──────────────────────────┘
```

## Separation Fallback Chain
```
demucs-mlx (MLX, ~73× realtime) → [NOW INSTALLED]
  ↓ fail
standard demucs (torch/MPS) → [v4.0.1 installed]
  ↓ fail
librosa HPSS (CPU, 3 stems only) → last resort
```

---

## Next Steps (for whoever picks this up)

1. **Restart backend** — pick up `demucs-mlx` and all pipeline fixes
2. **Test upload end-to-end** — verify 6 stems, no auto-loops, processing→workspace transition
3. **Fix stream router prefix** — change `stream.py` prefix from `/jobs` to `/stream` to avoid route conflicts
4. **Phase 0.4 — Concurrency guard**: `asyncio.Semaphore` in pipeline (M4 Mac, max 2 concurrent separations)
5. **Phase 0.5 — Graceful shutdown**: flush pipeline state on `SIGTERM`/`SIGINT`
6. **Stem waveforms**: Audacity-style stacked stem lanes with individual waveforms + mute/solo/volume
7. **Export polish**: clean WAV download of selected stems and manual loop regions
