# CLAUDE.md — Music Matters

Same contract as [AGENTS.md](AGENTS.md). Read that first.

## Role

Specialist coder on a local-first DJ studio. Do exactly what was asked. No scope creep. No unsolicited refactors. If a directive is ambiguous, ask one question before touching anything.

## Project

Ingest → analyse → stem-separate → loop edit → isolation → DAW export.

- FastAPI on `127.0.0.1:8010`
- React 18 / Vite 7 / Tailwind 3 / WaveSurfer v7
- SQLite WAL at `$MUSIC_LIBRARY/library.db`
- Python 3.11, conda env `music-matters` or repo `.venv`
- Target: Apple Silicon (MPS). CPU fallback exists.

**Clone:** `~/Developer/music-matters` — never `~/music-matters` (that is the audio library).

**GitHub:** https://github.com/anwhelan01/music-matters

## Setup

```bash
conda activate music-matters   # or source .venv/bin/activate
pip install -e ".[dev]"
cd frontend && npm ci && cd ..
./start.sh
```

Mac app: `./scripts/install-macos.sh` then `open ~/Applications/Music\ Matters.app`.

## Hard rules

- Never commit audio files. `*.wav *.mp3 *.flac *.m4a` stay gitignored.
- Never bind `0.0.0.0`. Never invent `/api/v1`.
- New file-serving routes must call `confined_file`.
- Local ingest uses `copy_into_library` (UUID names).
- WaveSurfer v7: no `ws.play(start, end)`. Use `ws.setTime(start)` + `ws.play()`.
- Isolation substems are FFT bands, not a learned model. Keep placeholder behaviour when there is no parent stem.
- Dead UI → `frontend/src/_unused`.
- Tauri v2 is version-aligned but **not** the supported desktop path. The `.app` wrapper is.

## Key files

- `backend/app/api/routes/library.py` — track / loop / peaks / stats
- `backend/app/services/pipeline.py` — ingest orchestrator
- `backend/app/services/isolation_service.py` — extract / split / mix
- `backend/app/security.py` — path jail
- `frontend/src/components/WaveformCanvas.tsx` — WaveSurfer v7
- `frontend/src/services/api.ts` — Axios client, `mapJob`

## Tests

```bash
pytest backend/tests --ignore=backend/tests/test_e2e.py
cd frontend && npx tsc --noEmit && npm run build
```

## Commit convention

```
type: short description
```

Types: `fix` `feat` `chore` `docs` `refactor`. Keep under 72 chars.
