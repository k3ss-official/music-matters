# Music Matters — Production-Ready MVP Plan

**Author:** Technical Director (Claude Opus 4.6)
**Date:** 2026-03-24
**Goal:** Best-in-class, production-ready local DJ automation platform on Apple M4

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Job queue | asyncio + SQLite persistence | Local-first single-machine app; Celery+Redis is overkill. Add Redis only if we scale to multi-machine. |
| Real-time progress | SSE (Server-Sent Events) | Replace 3s polling. Native browser support, no WebSocket overhead for unidirectional updates. |
| Frontend state | Zustand (Phase 3) | Current prop-drilling works but won't scale. Zustand is 1KB, zero boilerplate, React-native. |
| Model management | Config-driven registry | YAML model definitions, runtime selection, hot-swap without restart. |
| Audio engine | Keep WaveSurfer v7 | Mature, working well, custom region loop is solid. No reason to change. |

---

## Phase 0 — Foundation Hardening

> **Why first:** Every feature after this depends on reliable job execution and real-time feedback. Building on a shaky foundation means rework later.

### 0.1 — Job Persistence (SQLite)
- Add `jobs` table: `job_id, track_id, status, stages_json, created_at, updated_at, error`
- On startup: hydrate in-memory job dict from DB (same pattern as tracks)
- On stage transition: write to DB (not just in-memory)
- On crash recovery: resume `running` jobs as `queued`, re-execute
- **Files:** `db.py` (schema), `pipeline.py` (persistence hooks)

### 0.2 — SSE Progress Stream
- New endpoint: `GET /api/jobs/{job_id}/stream` → `text/event-stream`
- Events: `stage_start`, `stage_progress`, `stage_done`, `stage_error`, `job_done`
- Pipeline emits events via `asyncio.Queue` per job
- Frontend: `EventSource` replaces `setInterval` polling
- Keep polling as fallback (SSE disconnect recovery)
- **Files:** new `routes/stream.py`, `pipeline.py` (event emission), frontend `services/sse.ts`

### 0.3 — Concurrent Job Limiting
- Implement semaphore: `asyncio.Semaphore(MAX_CONCURRENT_JOBS)`
- Jobs beyond limit stay `queued`, auto-start when slot opens
- Surface queue position in job status
- **Files:** `pipeline.py`

### 0.4 — Graceful Shutdown
- On SIGTERM/SIGINT: finish current stage, persist state, don't start new stages
- Uvicorn shutdown hook in `main.py`
- **Files:** `main.py`, `pipeline.py`

**Deliverable:** Jobs survive restarts. Progress is real-time. System doesn't overload.

---

## Phase 1 — MLX Performance (The Differentiator)

> **Why second:** This is the core value proposition. A local stem separator that's 73× realtime on M4 is the killer feature. Everything else is UX around this.

### 1.1 — Wire demucs-mlx into Pipeline
- Replace PyTorch MPS demucs call with `from demucs_mlx import separate`
- Same `htdemucs_6s` model, 2.6× faster
- Keep PyTorch path as fallback (non-MLX machines)
- **Files:** `pipeline.py` `_stage_separation`

### 1.2 — BeatNet Downbeats
- Replace madmom RNN with BeatNet (single model → beats + downbeats)
- Wire real downbeats into `track.metadata.downbeats`
- Frontend already consumes these for snap grid — should "just work"
- **Files:** `mlx_analyzer.py`, `pipeline.py`

### 1.3 — Roformer Vocal Quality Path
- Add `separation_mode` parameter: `fast` (demucs-mlx) vs `quality` (Roformer for vocals)
- `mlx-audio-separator` + MelBand-Roformer: SDR 12.6 vs demucs ~8-9
- UI toggle in processing options
- **Files:** `pipeline.py`, `schemas.py`, frontend processing UI

### 1.4 — HF_HOME SSD Redirect
- Model weights → `/Volumes/MLX/cache/huggingface` (off boot SSD)
- Script to migrate existing cache
- Document in QUICKSTART.md
- **Files:** `config.py`, `scripts/setup_mlx_cache.sh`

**Deliverable:** Fastest local stem separation available. Real downbeats. Vocal quality option.

---

## Phase 2 — Multi-Model & Stem Control

> **Why third:** Users need choice. Different tracks benefit from different models. Stem selection prevents unnecessary computation.

### 2.1 — Model Registry
- `config/models.yaml`: define available models with metadata
  ```yaml
  models:
    htdemucs_6s:
      type: separation
      backend: demucs-mlx
      stems: [drums, bass, vocals, guitar, piano, other]
      speed: fast
      quality: good
    roformer_vocals:
      type: separation
      backend: mlx-audio-separator
      stems: [vocals, instrumental]
      speed: moderate
      quality: excellent_vocals
  ```
- Runtime model loader with lazy init + LRU cache
- API: `GET /api/models` → available models + status
- **Files:** new `services/model_registry.py`, `config/models.yaml`

### 2.2 — UI Model Selector
- Dropdown in processing dialog: pick separation model before ingest
- Show model metadata (speed, quality, stems available)
- Persist last-used model preference (localStorage)
- **Files:** frontend processing components

### 2.3 — Stem Selection Controls
- Checkboxes: select which stems to include in output
- Skip separation of unneeded stems (if model supports it)
- Export only selected stems
- **Files:** `StemLanes.tsx`, `pipeline.py`, `export/`

### 2.4 — SAM Audio Text-Prompted Extraction
- Already scaffolded in `library.py /extract` endpoint
- Wire `mlx-community/sam-audio-small` for real inference
- UI: text input "describe what you want" → surgical isolation
- **Files:** `pipeline.py`, `library.py`, frontend extraction UI

**Deliverable:** Users choose their model. Skip stems they don't need. Text-prompted extraction works.

---

## Phase 3 — Production Polish

> **Why fourth:** The engine works. Now make it bulletproof and pleasant.

### 3.1 — Frontend State Management (Zustand)
- Extract shared state from App.tsx into stores:
  - `useTrackStore` — selected track, detail, library list
  - `useTransportStore` — playback state, region, loop
  - `useJobStore` — active jobs, SSE connection
- Eliminates prop-drilling through 4+ levels
- **Files:** new `stores/` directory, refactor App.tsx + CentreWorkspace.tsx

### 3.2 — Error Boundaries & Recovery
- React error boundaries around each panel (sidebar crash doesn't kill waveform)
- Backend: structured error responses with codes
- Frontend: toast system for user-facing errors
- Auto-retry transient failures (network, file locks)
- **Files:** frontend components, backend error handling

### 3.3 — Data Integrity
- SQLite WAL mode (concurrent reads during writes)
- Foreign key enforcement
- Orphan cleanup (stems on disk without DB record)
- Backup/restore for library DB
- **Files:** `db.py`, new `services/maintenance.py`

### 3.4 — Export Quality
- Ableton Live project export: verify stem alignment + BPM grid
- Rekordbox: memory cues at phrase boundaries
- Audio export: normalize to -14 LUFS (streaming standard)
- **Files:** `export/`, `ableton_exporter.py`

**Deliverable:** App feels solid. Crashes are contained. Data is safe. Exports are pro-quality.

---

## Phase 4 — Advanced Features

> **Why last:** These are differentiators, not foundations. Ship the MVP first, then wow them.

### 4.1 — ACE-Step Music Generation
- Already scaffolded in `generate.py`
- UI: text prompt + BPM/key hints → generated audio
- Auto-ingest generated output into library
- **Files:** `generate.py`, frontend generation UI

### 4.2 — MIDI Controller Integration (APC Mini MK2)
- WebMIDI API in browser → 8×8 grid mapped to stems/phrases/transport
- Mapping already defined in `midi.py`
- Real-time pad lighting (stem active = lit)
- **Files:** new `hooks/useMIDI.ts`, `MIDIPanel.tsx`

### 4.3 — Chord Overlay in Waveform
- Render chord labels from `track.metadata.chords` above waveform
- Color-coded by chord quality (major/minor/dominant)
- Sync with playback position
- **Files:** `WaveformCanvas.tsx`

### 4.4 — Stem-to-MIDI (basic-pitch + Neural Engine)
- Already scaffolded in `library.py /midi` endpoint
- Wire `basic-pitch` for monophonic stem → MIDI
- Download as .mid file
- **Files:** `library.py`, frontend MIDI export UI

**Deliverable:** Creative tools that make this more than a stem splitter.

---

## Execution Order Summary

```
Phase 0  ████████░░  Foundation    ~3 sessions
Phase 1  ████████░░  MLX Engine    ~3 sessions
Phase 2  ██████░░░░  Model+Stems   ~3 sessions
Phase 3  ██████░░░░  Polish        ~2 sessions
Phase 4  ████░░░░░░  Advanced      ~3 sessions
```

Each phase is independently shippable. Phase 0+1 = functional MVP. Phase 2+3 = production-ready. Phase 4 = best-in-class.

---

## Non-Goals (Explicit)

- **No cloud deployment** — this is local-first, period
- **No user auth** — single-user app
- **No Electron/Tauri shipping** — Tauri scaffolding stays dormant until directed
- **No mobile** — desktop M4 Mac target only
- **No Celery/Redis** — unless we outgrow asyncio (unlikely for local)
