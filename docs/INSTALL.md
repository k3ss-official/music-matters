# Install

Repo: [anwhelan01/music-matters](https://github.com/anwhelan01/music-matters)

Do **not** clone into `~/music-matters`. That directory is the default **audio library**, not the source tree.

## Mac app (recommended)

```bash
git clone https://github.com/anwhelan01/music-matters.git ~/Developer/music-matters
cd ~/Developer/music-matters
./scripts/install-macos.sh
open ~/Applications/Music\ Matters.app
```

`install-macos.sh`:

1. Uses conda env `music-matters` if present, otherwise creates `./.venv`
2. `pip install -e .` and `npm ci && npm run build`
3. Writes **`~/Applications/Music Matters.app`**, a thin wrapper that points at this clone

Double-click the app after that. First Python install can take a long time (Demucs / PyTorch). First stem run downloads the model (~4 GB).

Logs: `~/Library/Logs/Music Matters.log`  
Quit: power button in the header, or `kill $(lsof -ti :8010)`

Re-run `./scripts/install-macos.sh` after `git pull`.

## Requirements

- macOS 13+
- Python 3.11+
- Node.js 18+
- FFmpeg (`brew install ffmpeg`) — YouTube / URL ingest
- Apple Silicon recommended (`DEMUCS_DEVICE=mps`); CUDA or CPU also work

Optional conda:

```bash
conda create -n music-matters python=3.11
conda activate music-matters
pip install -e ".[dev]"
cd frontend && npm ci
```

## Terminal

From the clone:

```bash
./start.sh          # Vite UI on :5173 + API on :8010
./start.sh --app    # built UI served by FastAPI on :8010
```

`Music Matters.command` in the repo root is a Finder double-click that prefers `--app` if `frontend/dist` exists.

## Configuration

`backend/.env` (optional):

```env
MUSIC_LIBRARY=~/music-matters
HOST=127.0.0.1
PORT=8010
DEMUCS_MODEL=htdemucs_6s
DEMUCS_DEVICE=mps
HF_HOME=~/.cache/huggingface
```

Local file ingest **copies** audio into the library under a UUID name. Original paths are never streamed.
