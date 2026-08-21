# HANDOFF — Music Matters

_Last updated: 2026-08-21_

## Overview

Local-first DJ tool: ingest → analyse → stem-separate → loop edit → isolation → DAW export.
FastAPI (`127.0.0.1:8010`) + React 18 / Vite / Tailwind. SQLite WAL. Apple Silicon target.

**Main is the production line.** PRs #3 (Isolation + Library dashboard) and #4 (hardening) are merged. Only `main` exists on GitHub.

## Run it

Mac app:

```bash
git clone https://github.com/k3ss-official/music-matters.git ~/Developer/music-matters
cd ~/Developer/music-matters
./scripts/install-macos.sh
open ~/Applications/Music\ Matters.app
```

Dev: `./start.sh`  ·  App-mode in Terminal: `./start.sh --app`

Do **not** clone into `~/music-matters` (that's the default audio library).

## What's real

- Path jail, localhost bind, UUID uploads, 200MB cap, kill allowlist
- Library duration / loop_count / stats / waveform peaks
- Isolation: region extract, 5-band FFT substem split, mix+EQ export
- FastAPI serves `frontend/dist` so the Mac app is one process
- CI: pytest + tsc + vite build
- MIT LICENSE

## Optional / later

- Tauri v2 is version-aligned (`io.k3ss.music-matters`) but the supported desktop path is the `~/Applications` wrapper — it does not need a Rust toolchain
- Isolation substems are frequency bands, not a learned source-separation model
- `frontend/src/_unused` is archived dead UI (tsc-excluded)
