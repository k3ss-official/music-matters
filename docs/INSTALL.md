# Install

Repo: [k3ss-official/music-matters](https://github.com/k3ss-official/music-matters)

Do **not** clone into `~/music-matters`. That directory is the default **audio library**, not the source tree.

## One-Shot Mac App Install (recommended)

Paste this single command into Terminal:

```bash
([ -d ~/Developer/music-matters ] || git clone https://github.com/k3ss-official/music-matters.git ~/Developer/music-matters) && cd ~/Developer/music-matters && ./scripts/install-macos.sh --open
```

Or from inside your clone:

```bash
./scripts/install-macos.sh --open
```

`install-macos.sh`:

1. Ensures Homebrew dependencies (`python@3.11`, `node`, `ffmpeg`, `libsndfile`, `chromaprint`) are installed, auto-installing any missing tools via `brew`
2. Uses conda env `music-matters` if present, otherwise creates `./.venv`
3. Runs `pip install -e .` and `npm ci && npm run build`
4. Initializes the audio library directories at `~/music-matters`
5. Writes **`/Applications/Music Matters.app`** (and `~/Applications/Music Matters.app`) and registers it with Finder / Spotlight / Launchpad
6. Runs a post-install smoke check and launches the app when `--open` is passed

Double-click **Music Matters** in **Applications** after that. First Python install can take a few minutes (Demucs / PyTorch). First stem run downloads the Demucs model (~4 GB).

Logs: `~/Library/Logs/Music Matters.log`  
Quit: power button in the header, or `kill $(lsof -ti :8010)`

Re-run `./scripts/install-macos.sh` after `git pull`.

## Requirements

- macOS 13+
- Homebrew (`https://brew.sh`) — `install-macos.sh` uses it to auto-install missing system tools
- Python 3.11+
- Node.js 18+
- FFmpeg (`brew install ffmpeg`) — YouTube / URL ingest & audio conditioning
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

`Music Matters.command` in the repo root is a Finder double-click that launches the installed app (or runs `install-macos.sh --open` on first run).

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
