# Music Matters

Local-first DJ and producer automation. Ingest audio, analyse structure, separate stems (Demucs/MLX), slice beat-aligned loops, isolate substems, and export to Ableton Live.

This is a **localhost app**, not a hosted service. The API binds `127.0.0.1` only.

## Quickstart

```bash
git clone https://github.com/k3ss-official/music-matters.git
cd music-matters
chmod +x start.sh
./start.sh
```

Then open **http://127.0.0.1:5173**. API docs: **http://127.0.0.1:8010/api/docs**. Stop with `Ctrl+C`.

`start.sh` prefers the conda env `music-matters` (Python 3.11). If conda is missing it creates/uses a venv.

### Requirements

- Python 3.11+
- Node.js 18+
- FFmpeg (`brew install ffmpeg` / `apt install ffmpeg`)
- ~4 GB disk for the Demucs model (downloaded on first stem run)
- Apple Silicon recommended for MLX/MPS; CPU fallback works anywhere

Optional conda setup:

```bash
conda create -n music-matters python=3.11
conda activate music-matters
pip install -e ".[dev]"
cd frontend && npm ci
```

## What it does

| Feature | Details |
|---|---|
| **Search & ingest** | Local files (copied into the library), URLs via yt-dlp, batch queue |
| **Analysis** | BPM, key, smart phrases (intro / verse / chorus / drop / …) |
| **Stem separation** | Demucs `htdemucs_6s` on Apple MPS — 6 stems; HPSS fallback |
| **Library** | Track table with duration, loop counts, BPM/key, status |
| **Loop editor** | WaveSurfer waveform, beat-snap regions, phrase snap, preview |
| **Isolation workspace** | Region extract from a parent stem, placeholder substem split/EQ |
| **Ableton export** | `.als` ZIP with stems on the session grid |
| **SQLite** | `library.db` with WAL + foreign keys; survives restarts |

## Configuration

Create `backend/.env` if you want to override defaults:

```env
MUSIC_LIBRARY=~/music-matters
HOST=127.0.0.1
PORT=8010
DEMUCS_MODEL=htdemucs_6s
DEMUCS_DEVICE=mps               # mps | cuda | cpu
HF_HOME=~/.cache/huggingface
```

Audio is served only from `MUSIC_LIBRARY`. Local ingest **copies** files in; original paths are never streamed.

## Manual run

```bash
# Terminal 1 — backend (from repo root)
cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8010

# Terminal 2 — frontend
cd frontend && npm run dev -- --host 127.0.0.1
```

## Tests

```bash
pip install -e ".[dev]"
pytest backend/tests --ignore=backend/tests/test_e2e.py
cd frontend && npx tsc --noEmit && npm run build
```

## License

MIT. See [LICENSE](LICENSE).
