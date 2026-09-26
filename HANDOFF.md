# HANDOFF — Music Matters

_Last updated: 2026-08-23_

Repo: [k3ss-official/music-matters](https://github.com/k3ss-official/music-matters)  
Docs: [docs/README.md](docs/README.md)

## Overview

Local-first DJ tool: ingest → analyse → stem-separate → loop edit → isolation → DAW export.
FastAPI (`127.0.0.1:8010`) + React 18 / Vite / Tailwind. SQLite WAL. Apple Silicon target.

## Run it

```bash
git clone https://github.com/k3ss-official/music-matters.git ~/Developer/music-matters
cd ~/Developer/music-matters
./scripts/install-macos.sh
open ~/Applications/Music\ Matters.app
```

Dev: `./start.sh` · App-mode in Terminal: `./start.sh --app`

Do **not** clone into `~/music-matters` (default audio library).

## What's real

- Path jail, localhost bind, UUID uploads, 200 MB cap, kill allowlist
- Library duration / loop_count / stats / waveform peaks
- Isolation: region extract, 5-band FFT substem split, mix+EQ export
- FastAPI serves `frontend/dist` so the Mac app is one process
- CI: pytest + tsc + vite build
- MIT LICENSE
- Docs match the launcher and `/api` (see `docs/`)

## Optional / later

- Tauri v2 is version-aligned; the supported desktop path is the `~/Applications` wrapper
- Isolation substems are frequency bands, not a learned separator
- `frontend/src/_unused` is archived dead UI
- `docs/archive/` is historical — do not implement from it
