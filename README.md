# Music Matters

Local-first DJ and producer tool. Ingest audio, analyse structure, separate stems, slice loops, isolate substems, export to Ableton.

This is a **localhost app for you**, not a hosted service. The API binds `127.0.0.1` only.

## Install as a Mac app (`~/Applications`)

Do **not** clone into `~/music-matters` — that path is the default **audio library**. Clone next to it:

```bash
git clone https://github.com/k3ss-official/music-matters.git ~/Developer/music-matters
cd ~/Developer/music-matters
./scripts/install-macos.sh
open ~/Applications/Music\ Matters.app
```

That script:

1. Creates/uses the `music-matters` conda env, or a repo `.venv`
2. Installs Python + Node deps and builds the UI
3. Writes **`~/Applications/Music Matters.app`**

Double-click the app any time after that. It starts the server, then opens a Chrome/Edge/Brave app window (Safari fallback). Quit from the power button in the header.

Logs: `~/Library/Logs/Music Matters.log`. Re-run `./scripts/install-macos.sh` after `git pull`.

### Requirements

- macOS 13+
- Python 3.11+
- Node.js 18+
- FFmpeg (`brew install ffmpeg`) — needed for YouTube ingest
- ~4 GB disk for Demucs on first stem run
- Apple Silicon recommended (MPS); CPU works

## Dev loop (Terminal)

```bash
./start.sh
```

Vite UI: **http://127.0.0.1:5173**. API docs: **http://127.0.0.1:8010/api/docs**.

App-mode in Terminal (built UI, no Vite):

```bash
./start.sh --app
```

## What it does

| Feature | Details |
|---|---|
| **Search & ingest** | Local files (copied into the library), URLs via yt-dlp, batch queue |
| **Analysis** | BPM, key, smart phrases (intro / verse / chorus / drop / …) |
| **Stem separation** | Demucs `htdemucs_6s` on Apple MPS — 6 stems; HPSS fallback |
| **Library** | Track table with real waveform thumbs, duration, loop counts, BPM/key |
| **Loop editor** | WaveSurfer waveform, beat-snap regions, phrase snap, preview |
| **Isolation workspace** | Region extract → 5-band substem split → mix/EQ → export WAV |
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

## Tests

```bash
pip install -e ".[dev]"
pytest backend/tests --ignore=backend/tests/test_e2e.py
cd frontend && npx tsc --noEmit && npm run build
```

## License

MIT. See [LICENSE](LICENSE).
