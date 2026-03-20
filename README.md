# Music Matters

A local-first DJ and producer automation platform. Ingest audio, analyse structure, separate stems with Demucs/MLX, slice beat-aligned loops, and export to Ableton Live.

## Quickstart (60 seconds)

```bash
git clone https://github.com/k3ss-official/music-matters.git
cd music-matters
chmod +x start.sh
./start.sh
```

That's it. The script:
- Creates a Python virtualenv and installs backend deps
- Runs `npm install` for the frontend
- Starts FastAPI on **http://localhost:8010**
- Starts Vite on **http://localhost:5173**
- Stop with `Ctrl+C`

> **Requirements:** Python 3.10+, Node.js 18+, FFmpeg (`brew install ffmpeg`)


A local-first DJ and producer automation platform. Ingest audio from YouTube or local files, analyse structure, separate stems with Demucs, slice beat-aligned loops, and export directly to Ableton Live.

## What it does

| Feature | Details |
|---|---|
| **Search & ingest** | Text queries (`ytsearch1:`) or direct URLs via yt-dlp; batch mode for queuing multiple tracks at once |
| **Analysis** | BPM detection, key detection (Krumhansl–Schmuckler), smart phrase detection (intro/verse/chorus/drop/bridge/outro + more) |
| **Stem separation** | Demucs `htdemucs_6s` on Apple MPS — 6 stems (drums, bass, vocals, guitar, piano, other); HPSS fallback |
| **Loop editor** | Wavesurfer waveform with beat-snap drag/resize regions, smart phrase snap buttons, preview playback |
| **Loop export** | Save custom loops (start/end time) to the library; auto-tagged with energy, BPM range, key |
| **Ableton export** | One-click `.als` ZIP with stems placed on session grid tracks |
| **MIDI stub** | APC Mini MK2 8×8 grid mapping — `GET /api/midi/apc-mini-mk2/mapping` |
| **SQLite persistence** | `library.db` survives restarts; track + loop tables with full metadata |

## Requirements

- Python 3.10+
- Node.js 18+
- FFmpeg (`brew install ffmpeg`)
- ~4 GB disk for Demucs model (auto-downloaded on first use)
- macOS with Apple Silicon for MPS acceleration (CPU fallback works anywhere)

## Install

```bash
git clone https://github.com/k3ss-official/music-matters.git
cd music-matters

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install demucs          # separate step — pulls PyTorch

# Frontend
cd ../frontend
npm install
```

Create `backend/.env` (optional):

```env
MUSIC_LIBRARY=~/Music Matters   # where audio, stems, loops are stored
DEMUCS_MODEL=htdemucs_6s
DEMUCS_DEVICE=mps               # mps | cuda | cpu
```

## Run

```bash
# Terminal 1 — backend
cd backend && source .venv/bin/activate
uvicorn app.main:app --port 8010 --reload

# Terminal 2 — frontend
cd frontend && npm run dev

# Open http://localhost:5173
```

API docs: [http://localhost:8010/api/docs](http://localhost:8010/api/docs)

## Ingest a track

**Single:**
- Type a search query or paste a URL in the search bar → press Search/Queue
- The job appears in the Queue panel; stages run in order: Ingest → Analysis → Separation → Loop Slicing

**Batch:**
- Click the **Batch** tab in the search panel
- Paste one query or URL per line (max 50)
- Click **Queue N Tracks** — all jobs enqueue immediately

## Smart Phrase Snap

Once a track is open in the workspace and the waveform has loaded, the **Smart Phrases** row populates with buttons (Intro, Verse, Chorus, Drop, …). Clicking any button snaps the region selector to that phrase boundary. Each button shows the bar number and a confidence percentage.

## Ableton Export

1. Open a track in the Centre Workspace
2. Drag/resize the region or use a smart phrase button to set start/end
3. Click **Export to Ableton (.als)** in the Export panel
4. The `.als` file downloads automatically — open it in Ableton Live 11+

The ZIP contains:
- `project.xml` — Ableton session grid with stems on tracks 1–8
- `Samples/` — copies of the selected stem WAV files
- `ProjectInfo_*/CollectionInfo` — file references

## APC Mini MK2 MIDI Mapping

```
GET /api/midi/apc-mini-mk2/mapping
```

Returns 64 pad definitions. Row layout:

| Row | Function |
|-----|----------|
| 0 | Drums stem — 8 scene slots |
| 1 | Bass stem |
| 2 | Vocals stem |
| 3 | Guitar stem |
| 4 | Piano stem |
| 5 | Other stem |
| 6 | Smart phrase buttons (Intro/Verse/Chorus/Drop/Bridge/Outro/Prev/Next) |
| 7 | Transport (Play, Record, Snap, Save, Ableton Export, Stems, BPM Tap, Panic) |

Full MIDI implementation (mido/rtmidi listener) is a future task — the mapping endpoint provides the canonical note-to-function table.

## API reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/ingest/ingest` | POST | Ingest single URL or text query |
| `/api/ingest/upload` | POST | Upload audio file |
| `/api/ingest/batch` | POST | Batch ingest (list of queries) |
| `/api/library/tracks` | GET | List all tracks |
| `/api/library/tracks/{id}` | GET | Track detail |
| `/api/library/tracks/{id}/phrases` | GET | Smart phrase detection |
| `/api/library/tracks/{id}/loops/custom` | POST | Save custom loop |
| `/api/library/tracks/{id}/loops` | GET | List loops |
| `/api/jobs/{job_id}` | GET | Job status + stage progress |
| `/api/jobs/active` | GET | Active jobs |
| `/api/export/ableton` | POST | Export stems to `.als` |
| `/api/export/rekordbox` | POST | Rekordbox XML |
| `/api/export/serato` | POST | Serato crate |
| `/api/midi/apc-mini-mk2/mapping` | GET | APC Mini MK2 pad mapping |

## Run tests

```bash
cd backend
source .venv/bin/activate

# Start backend first in another terminal
uvicorn app.main:app --port 8010

# Run E2E smoke tests
MM_BASE_URL=http://localhost:8010/api pytest tests/test_e2e.py -v
```

## Tech stack

**Backend:** FastAPI · SQLite (via raw `sqlite3`) · librosa · Demucs `htdemucs_6s` · yt-dlp · soundfile · numpy

**Frontend:** React 18 · TypeScript · Vite · Tailwind CSS · Wavesurfer.js · Tauri (optional desktop wrapper)

## Known limitations

- Stem separation takes 30–90s per track (MPS); CPU fallback is 3–5× slower
- Smart phrase detection uses onset + energy heuristics — results vary by genre
- Ableton export generates a valid ZIP but does not embed warp markers or clip envelopes
- MIDI mapping is a static stub — no live MIDI I/O is implemented yet
- Batch ingest queues all jobs immediately; the pipeline processes them sequentially per worker
