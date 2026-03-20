# Music Matters — AI Handover Brief

> **For the next AI agent picking this up.**
> Read this entire document before touching any code.
> Everything you need to know is here.

---

## What This Project Is

**Music Matters** is a local-first DJ and producer automation platform built for Apple Silicon (M4).
It is a FastAPI + React/TypeScript application that lets a DJ:

1. **Ingest** — search YouTube by text query or paste a direct URL; yt-dlp downloads the track
2. **Analyse** — auto-detect BPM, musical key (Krumhansl-Schmuckler + Camelot wheel), smart phrase detection (intro/verse/chorus/drop/bridge/breakdown/outro), beat grid, downbeats
3. **Separate** — run Demucs stem separation (htdemucs_ft = 4 stems, htdemucs_6s = 6 stems: drums/bass/vocals/guitar/piano/other); uses `demucs-mlx` on Apple Silicon for ~73x realtime speed
4. **Loop** — interactive waveform editor: drag to select regions, snap to beat grid, nudge IN/OUT points by 1 beat, quantize to bar, 1/2/4/8/16/32-bar presets, save loops to library
5. **Steal** — save/export the selected region as a custom loop, trigger stem export
6. **Export** — generate Ableton `.als` project with stems pre-placed on session grid tracks

The user is `k3ss-official` (scousercheeky@gmail.com). The machine is an Apple M4 with a `/Volumes/MLX` volume dedicated to MLX model storage.

---

## Repository

```
https://github.com/k3ss-official/music-matters
Branch: main
Latest commit: 9b13c6e — chore: add start.sh single-command launcher, .env.example, quickstart README
```

### How to clone and run

```bash
git clone https://github.com/k3ss-official/music-matters.git
cd music-matters
chmod +x start.sh
./start.sh
```

`start.sh` creates `backend/.venv`, installs Python deps, runs `npm install`, then starts:
- FastAPI backend on **http://localhost:8010** (`--reload`)
- Vite frontend on **http://localhost:5173** (proxies `/api` → backend)

Stop with `Ctrl+C`.

Prerequisites: `python3`, `node`, `npm`, `ffmpeg` (`brew install ffmpeg`)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI 0.115, Python 3.11, uvicorn |
| Frontend | React 18, TypeScript 5.3, Vite 7 |
| Styling | Tailwind CSS 3.4 |
| Audio | WaveSurfer.js v7.12 (CRITICAL — v7 API, not v6) |
| Icons | lucide-react 0.577 |
| Stem separation | demucs-mlx (Apple Silicon MLX port) |
| Audio analysis | librosa 0.10, numpy, scipy |
| Download | yt-dlp |
| Metadata | musicbrainzngs |
| Persistence | SQLite via `backend/app/services/db.py` |
| Export | Custom Ableton .als XML builder |

---

## Project Structure

```
music-matters/
├── start.sh                        ← single-command dev launcher
├── .env.example                    ← copy to .env if needed
│
├── backend/
│   ├── app/
│   │   ├── main.py                 ← FastAPI app, CORS, startup
│   │   ├── config.py               ← settings (PORT=8010, DEMUCS_MODEL, etc.)
│   │   ├── api/
│   │   │   ├── router.py           ← registers all route modules
│   │   │   ├── schemas.py          ← Pydantic request/response models
│   │   │   └── routes/
│   │   │       ├── ingest.py       ← POST /api/ingest/ingest, /api/ingest/batch
│   │   │       ├── library.py      ← GET /api/library/tracks, /tracks/{id}, /tracks/{id}/phrases, /tracks/{id}/loops/custom
│   │   │       ├── audio.py        ← GET /api/audio/tracks/{id}, /api/audio/stems/{id}/{stem}
│   │   │       ├── analysis.py     ← analysis endpoints
│   │   │       ├── export.py       ← POST /api/export/ableton
│   │   │       ├── jobs.py         ← job queue status
│   │   │       ├── midi.py         ← APC Mini MK2 8×8 grid mapping stub
│   │   │       ├── search.py       ← search endpoints
│   │   │       ├── status.py       ← GET /api/status/heartbeat
│   │   │       ├── fingerprint.py  ← audio fingerprinting
│   │   │       └── processing.py   ← processing pipeline triggers
│   │   └── services/
│   │       ├── db.py               ← SQLite DatabaseService, UPSERT, hydration on boot
│   │       ├── pipeline.py         ← PipelineOrchestrator — ingest → analyse → separate → loop
│   │       ├── library.py          ← in-memory track registry + DB sync
│   │       ├── ableton_exporter.py ← builds .als zip (XML + stem files)
│   │       ├── analysis/
│   │       │   ├── audio_analyzer.py    ← BPM, key, beat grid, downbeats
│   │       │   ├── sota_analyzer.py     ← smart phrase detection (onset + energy + downbeats)
│   │       │   └── harmonic_mixer.py    ← Camelot wheel, mashup scoring
│   │       ├── processing/
│   │       │   ├── stem_separator.py    ← calls demucs-mlx
│   │       │   ├── audio_processor.py   ← audio manipulation
│   │       │   └── sample_extractor.py  ← loop slicing
│   │       ├── search/
│   │       │   ├── download_service.py  ← yt-dlp wrapper
│   │       │   ├── metadata_service.py  ← MusicBrainz lookup
│   │       │   └── track_finder.py      ← multi-source search orchestrator
│   │       ├── fingerprint/
│   │       │   └── audio_fingerprint.py ← fingerprint + similarity
│   │       └── export/
│   │           └── daw_exporter.py      ← Rekordbox/Serato/M3U export
│   └── requirements.txt
│
├── frontend/
│   ├── package.json                ← wavesurfer.js ^7.12.1, lucide-react, react 18, vite 7
│   ├── vite.config.ts              ← port 5173, proxy /api → localhost:8010
│   └── src/
│       ├── App.tsx                 ← root layout, global state, polling loops
│       ├── types.ts                ← all TypeScript interfaces
│       ├── services/api.ts         ← all API calls (axios), ApiError class
│       └── components/
│           ├── WaveformCanvas.tsx      ← ★ REWRITTEN — see below
│           ├── TransportBar.tsx        ← ★ NEW — see below
│           ├── LoopEditorToolbar.tsx   ← ★ REWRITTEN — see below
│           ├── CentreWorkspace.tsx     ← ★ REWRITTEN — see below
│           ├── SearchIngest.tsx        ← URL + text ingest, batch tab
│           ├── LibraryBrowser.tsx      ← track list, auto-tag chips
│           ├── AnalysisPanel.tsx       ← BPM, key, phrase display
│           ├── ExportPanel.tsx         ← Ableton export button + download
│           ├── StemLanes.tsx           ← stem playback lanes
│           ├── QueuePanel.tsx          ← job progress display
│           └── ...
│
└── docs/
    ├── STATUS.md               ← this file
    ├── API-SPEC.md             ← full API reference
    ├── ARCHITECTURE.md         ← system design
    ├── PIPELINE.md             ← ingest → process pipeline detail
    └── DEMUCS.md               ← stem separation notes
```

---

## The Four Core Rewritten Components (★)

These four files were completely rewritten in the most recent major session. They are the heart of the waveform/loop workflow.

### Critical: WaveSurfer v7 API

The project uses **wavesurfer.js v7.12.1**. v7 removed the `play(startTime, endTime)` API. Any AI touching this code must know:

```typescript
// ❌ WRONG — does not exist in v7
ws.play(region.start, region.end)

// ✅ CORRECT — v7 pattern
ws.setTime(region.start)
ws.play()
// loop via audioprocess event: if (currentTime >= region.end) ws.setTime(region.start)
```

---

### `WaveformCanvas.tsx` — 467 lines

The WaveSurfer v7 waveform component. Exposes an imperative `WaveformHandle` ref.

**What it does:**
- Initialises WaveSurfer with `RegionsPlugin` and `TimelinePlugin`
- Draws a BPM grid overlay on a `<canvas>` (bar lines cyan, beat lines white/faint)
- Beat snap: merges downbeats array + BPM-computed grid, 0.08s threshold
- Bidirectional sync: `syncRegion(start, end)` pushes toolbar changes back to the live WaveSurfer region handle via `region.setOptions()`
- Drag-to-create: `region-created` event fires on new drag; replaces any existing region
- Loop playback via `audioprocess` event (not `play(start, end)`)

**`WaveformHandle` interface (ref):**
```typescript
export interface WaveformHandle {
    play(): void
    pause(): void
    stop(): void              // pause + setTime(0)
    playRegion(): void        // setTime(region.start) + play + loop
    stopRegion(): void        // pause + setTime(region.start)
    seek(seconds: number): void
    zoomIn(): void
    zoomOut(): void
    zoomFit(): void
    setVolume(v: number): void
    getDuration(): number
    isPlaying(): boolean
    syncRegion(start: number, end: number): void  // push external changes to WS region
}
```

**Props:**
```typescript
interface WaveformCanvasProps {
    audioUrl: string | null
    onReady?: (duration: number) => void
    onError?: (error: Error, url: string) => void
    onRegionUpdate?: (start: number, end: number) => void
    onTimeUpdate?: (currentTime: number) => void
    onPlayStateChange?: (playing: boolean) => void
    wavesurferRef?: React.MutableRefObject<WaveSurfer | null>
    regionsRef?: React.MutableRefObject<any>
    downbeats?: number[]           // from track analysis — used for snap grid
    bpm?: number | null
    snapEnabled?: boolean
    regionStart?: number           // controlled — triggers syncRegion when changed
    regionEnd?: number
}
```

---

### `TransportBar.tsx` — 256 lines

New component. Sits above the waveform.

**Controls:**
- Stop button (Square icon) — calls `waveformRef.current.stop()`
- Play/Pause button (large, purple when playing) — calls `play()` or `pause()`, or `playRegion()` if loop mode is on
- Loop Region toggle (Repeat icon, green when active) — switches between full-track and region-loop playback
- Playhead time display `MM:SS.ms` in cyan monospace
- Duration display
- BPM badge (from trackDetail)
- SNAP toggle (cyan when on)
- Zoom Out / Zoom Fit / Zoom In buttons (call `waveformRef` methods)
- Volume slider + mute toggle

**Props:** `waveformRef`, `isPlaying`, `isLooping`, `currentTime`, `duration`, `volume`, `bpm`, `snapEnabled`, `onToggleLoop`, `onVolumeChange`, `onSnapToggle`

---

### `LoopEditorToolbar.tsx` — 333 lines

Sits below the waveform. The IN/OUT editor.

**Controls:**
- **IN** time display — click to edit inline (`MM:SS.ms` format, Enter to commit)
- `◀ ▶` nudge buttons either side of IN and OUT — steps by 1 beat (falls back to 0.25s without BPM); calls `syncRegion()` so the waveform highlight actually moves
- **Loop length** display in both seconds and bars+beats (e.g. "4 bars")
- **OUT** time display — click to edit inline
- **Q** quantize-to-bar button — snaps both IN and OUT to nearest bar boundary (disabled without BPM)
- **Bar presets** — buttons for 1 / 2 / 4 / 8 / 16 / 32 bars; snaps start to nearest bar and sets end = start + (n × bar_duration)
- **STEAL** button (red, Scissors icon) — saves the region + stops at IN point
- **SAVE LOOP** button (green, Save icon) — calls `POST /api/library/tracks/{id}/loops/custom`

**Key design:** All nudge and preset operations call `waveformRef.current.syncRegion(s, e)` AND `onRegionChange(s, e)` so the waveform highlight and React state both update together — this was the core bug in the previous version.

---

### `CentreWorkspace.tsx` — 348 lines

The orchestrator. Owns all transport state.

**State it owns:**
- `isPlaying`, `isLooping` — play/loop state
- `currentTime`, `duration` — from `onTimeUpdate` callback
- `volume`, `snapEnabled` — passed to TransportBar

**Wires:**
- `waveformRef: React.RefObject<WaveformHandle>` — passed to all three child components
- `regionStart / regionEnd` passed as controlled props into `WaveformCanvas` → triggers bidirectional sync
- `onTimeUpdate` → `setCurrentTime` → TransportBar time display
- `onPlayStateChange` → `setIsPlaying`
- Smart phrases fetched from API on track load → displayed as clickable buttons below waveform (clicking calls `syncRegion()` + `seek()`)
- Save loop → `POST /api/library/tracks/{id}/loops/custom` with stems list from `trackDetail`

---

## Design Tokens (use these — do not invent new colours)

```css
/* Backgrounds */
#0a0a0f   /* darkest */
#0d0d1a   /* transport bar, toolbar */
#10101e   /* loop toolbar */
#12121a   /* panels */
#1a1a26   /* cards */

/* Accents */
#00d4ff   /* cyan — playhead, IN point, snap, zoom */
#8b5cf6   /* purple — play button active, BPM */
#00ff88   /* green — loop active, save, OUT point */
#ff3b5c   /* red — steal, error */

/* Text */
white/70  /* primary */
white/40  /* secondary */
white/20  /* tertiary */
```

Tailwind dark theme throughout. Fonts: monospace for time/BPM displays (`font-mono`, `tabular-nums`, `tracking-widest uppercase` for labels).

---

## API Endpoints (key ones)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/status/heartbeat` | Heartbeat |
| `POST` | `/api/ingest/ingest` | Ingest single track (URL or text query) |
| `POST` | `/api/ingest/batch` | Batch ingest (array of sources) |
| `GET` | `/api/library/tracks` | List all tracks |
| `GET` | `/api/library/tracks/{id}` | Track detail (BPM, key, stems, loops, metadata) |
| `GET` | `/api/library/tracks/{id}/phrases` | Smart phrase detection results |
| `POST` | `/api/library/tracks/{id}/loops/custom` | Save custom loop `{start_time, end_time, stems}` |
| `GET` | `/api/audio/tracks/{id}` | Serve original audio file |
| `GET` | `/api/audio/stems/{id}/{stem_name}` | Serve a stem file |
| `POST` | `/api/export/ableton` | Generate + download `.als` project |
| `GET` | `/api/midi/apc-mini-mk2/mapping` | APC Mini MK2 8×8 grid mapping |

API docs (Swagger): `http://localhost:8010/api/docs`

---

## What Has Been Built (Completed Work)

### Phase 1 — Foundation (original codebase)
- FastAPI backend with full service architecture
- React frontend with dark DJ theme
- SQLite persistence (`db.py`) — UPSERT, hydration on boot, survives restarts
- Track ingest pipeline: text query → `ytsearch1:` → yt-dlp → file on disk
- Audio analysis: BPM, key detection, beat grid, downbeats
- Smart phrase detection (`sota_analyzer.py`): onset + energy + downbeats → chorus/drop/intro/verse/bridge etc. with confidence scores
- Stem separation: `demucs-mlx` integration (`htdemucs_ft` 4-stem, `htdemucs_6s` 6-stem)
- Ableton `.als` export: stems on 8-track session grid
- APC Mini MK2 MIDI mapping stub
- Batch ingest endpoint
- Auto-tagging (energy, tags) on loop slices
- E2E smoke test suite (`backend/tests/test_e2e.py`)
- `start.sh` single-command launcher
- Full documentation set

### Phase 2 — Waveform Engine Rewrite (most recent session)
Complete ground-up rewrite of the 4 core UI components:
- Fixed all broken WaveSurfer v7 API calls (the root cause of play/stop not working)
- Fixed region highlight not resizing (toolbar nudges now call `syncRegion()`)
- Fixed drag-to-create (was only hooking existing region drag, not new drag)
- Added BPM quantize grid overlay on canvas
- Added beat snap with threshold (merges downbeats + BPM-computed grid)
- Added bidirectional sync (toolbar → WaveSurfer region, not one-way)
- Built TransportBar from scratch (Play/Pause/Stop/Loop, time display, volume, zoom, snap)
- Built LoopEditorToolbar with bar presets, inline time editing, quantize button
- Rewired CentreWorkspace to own all transport state correctly

---

## What Is Outstanding

### Immediate / High Priority

| # | Task | Notes |
|---|---|---|
| 1 | **First-run local test** | User has not yet cloned and run the new code on their M4. The `start.sh` script is ready. First run will verify backend boots, frontend compiles, waveform loads. |
| 2 | **demucs-mlx verification** | `requirements.txt` has demucs commented out (`# demucs==4.0.1`). The user uses `demucs-mlx` from their MLX volume. Confirm the backend's `stem_separator.py` calls `demucs-mlx` CLI correctly, not the PyTorch `demucs` package. |
| 3 | **Audio URL resolution** | `GET /api/audio/tracks/{id}` — verify the path resolution works on the user's machine. The track files are on `/Volumes/deep-1t/Users/k3ss/...`. Config path in `config.py` needs to match. |
| 4 | **Smart phrase endpoint wiring** | `CentreWorkspace.tsx` calls `getSmartPhrases(trackId)` — verify `GET /api/library/tracks/{id}/phrases` returns the right shape. `SmartPhrase` type: `{phrase_type, start_time, end_time, confidence}`. |

### MLX Upgrade Pipeline (planned, not started)

Based on research done before this session, the following upgrades are ready to implement when the user returns:

| Tool | What it replaces/adds | Install |
|---|---|---|
| **BeatNet** | Replace `librosa.beat.beat_track()` — returns beats AND downbeats, handles tempo changes, CRNN + particle filter | `pip install BeatNet` |
| **mlx-audio-separator** | MelBand-Roformer for vocals (12.6 SDR vs demucs ~9 SDR), BS-Roformer for instrumentals (16.5 SDR) | `pip install mlx-audio-separator` |
| **SAM Audio (Meta, MLX port)** | Text-prompted separation: `descriptions=["kick drum"]` — extracts any sound by description | `pip install -U mlx-audio` → `mlx-community/sam-audio-small` |
| **basic-pitch (Spotify)** | Audio → MIDI transcription from any stem, polyphonic, runs CoreML on Neural Engine | `pip install basic-pitch` |
| **mlx-whisper** | Lyric + timestamp extraction from vocal stems | `pip install mlx-whisper` → `mlx-community/whisper-large-v3-turbo` |
| **ACE-Step 1.5** | Full music GENERATION from text prompts (BPM, key, style), cover generation, vocal→BGM, MIT licensed | `git clone github.com/ace-step/ACE-Step-1.5` |
| **demucs-mlx fp16** | Use `mlx-community/demucs-mlx-fp16` for faster preview separations | `--hf-repo mlx-community/demucs-mlx-fp16` |

A full 14-page intel brief on all of these is saved as `mlx-music-intel.pdf` (was shared with user, not committed to repo).

### `/Volumes/MLX` Cache Setup (not yet done)

```bash
echo 'export HF_HOME=/Volumes/MLX/hf-cache' >> ~/.zshrc
echo 'export TRANSFORMERS_CACHE=/Volumes/MLX/hf-cache' >> ~/.zshrc
```

Recommended `/Volumes/MLX/` folder structure:
```
/Volumes/MLX/
├── demucs/htdemucs_ft/        ← fp32 archival
├── demucs/htdemucs_6s-fp16/   ← fp16 speed
├── roformer/mel-band-vocals/  ← MelBand-Roformer vocals
├── roformer/bs-viperx-1297/   ← instrumental SDR 16.5
├── whisper/large-v3-turbo/
├── sam-audio/sam-audio-small/
└── hf-cache/                  ← HuggingFace download cache
```

### Longer Term (from ROADMAP.md)
- Real-time MIDI controller support (APC Mini MK2 — stub exists, implementation pending)
- Redis job queue (replace in-memory queue)
- Tauri desktop app wrapper (scaffolding exists in `frontend/src-tauri/`, not built)
- Docker Compose setup
- Test coverage >80%

---

## Known Issues / Watch Out For

1. **`Any` import in db.py** — An earlier session had a `NameError: name 'Any' is not defined` in `db.py` line 110. This was fixed. If you see it again, add `from typing import Any` at the top of the file.

2. **Demucs commented out in requirements.txt** — Intentional. The user runs `demucs-mlx` from their conda/MLX env, not the pip package. Do not uncomment unless you know what you're doing.

3. **WaveSurfer v7 — no `play(start, end)`** — Covered above. If any component is calling `ws.play(start, end)`, that is a bug. Use `setTime()` + `play()` + `audioprocess` loop.

4. **Path on user's machine** — Tracks are stored under `~/Music Matters/` by default (see `config.py`). The user's machine has a `/Volumes/deep-1t/` external drive. Audio path resolution may need adjustment on first run.

5. **Tauri scaffolding** — `frontend/src-tauri/` is scaffolded but not in active use. Do not try to build the Tauri app unless specifically asked. `npm run dev` (Vite only) is the correct dev command.

---

## Commit History (last 5)

```
9b13c6e  chore: add start.sh single-command launcher, .env.example, quickstart README
127048d  feat: production waveform engine — WaveSurfer v7, transport bar, bidirectional region sync, quantize grid
3859ff9  feat: production waveform engine — (TransportBar push)
88330a7  feat: production waveform engine — (LoopEditorToolbar push)
3a4026ac feat: production waveform engine — (WaveformCanvas push)
```

---

## Tone & Working Style

- The user is a DJ/producer, not a developer. Explain decisions in musical terms when possible.
- Work at pace. Don't over-explain. Ship working code.
- Credit budget awareness: user specified `MAX 1800 CREDITS TOTAL` in early sessions. Always estimate cost before multi-step plans.
- Push to GitHub via `gh api --method PUT repos/k3ss-official/music-matters/contents/{path}` with `api_credentials=["github"]` in bash tool.
- All pushes go to `main`. No branching unless asked.
- No audio files committed (`.gitignore` enforces this).
- Design tokens above are law. Don't introduce new colours.

---

*Last updated: 20 March 2026 — compiled by Perplexity Computer*
