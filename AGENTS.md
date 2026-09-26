# AGENTS.md — Music Matters

Local-first DJ / producer studio. One user, one Mac, loopback only.

## Paths

| What | Where |
|---|---|
| Clone (source) | `~/Developer/music-matters` recommended. **Never** `~/music-matters`. |
| Audio library | `~/music-matters` (`MUSIC_LIBRARY`) — SQLite, copies, stems, isolation |
| GitHub | https://github.com/k3ss-official/music-matters |
| Desktop app | `~/Applications/Music Matters.app` via `./scripts/install-macos.sh` |

## Stack

Python 3.11 · FastAPI · uvicorn · React 18 · Vite 7 · Tailwind 3 · WaveSurfer v7 · SQLite WAL.

API binds **`127.0.0.1:8010`**. No auth. No SaaS.

## Run

```bash
./start.sh                 # Vite :5173 + API :8010
./start.sh --app           # FastAPI serves frontend/dist
./scripts/install-macos.sh # writes ~/Applications/Music Matters.app
```

Conda env `music-matters` or repo `.venv`. `pip install -e ".[dev]"`.

## Hard rules

- Bind `127.0.0.1`. Never `0.0.0.0`.
- File serving and local ingest go through `backend/app/security.py` (`confined_file`, `safe_name`, `copy_into_library`).
- Local ingest **copies** into the library under a UUID name. Never stream the original path.
- There is no `/api/v1`. Prefix is `/api`.
- Never commit audio (`*.wav`, `*.mp3`, `*.flac`, `*.m4a`).
- WaveSurfer v7: do **not** use `ws.play(start, end)`. Use `setTime` + `play`.
- Isolation split is 5-band FFT on `extracted_region.wav`, not a learned separator.
- Dead UI lives in `frontend/src/_unused` (tsc-excluded).
- `backend/tests/conftest.py` sets `MUSIC_LIBRARY` to a temp dir **before** importing the app.
- Tests: `pytest backend/tests --ignore=backend/tests/test_e2e.py`. Frontend: `npx tsc --noEmit && npm run build`.

## Layout

- `backend/app/main.py` — lifespan, path jail, SPA mount of `frontend/dist`
- `backend/app/config.py` — pydantic-settings (`HOST`, `MUSIC_LIBRARY`, Demucs)
- `backend/app/security.py` — confinement helpers
- `backend/app/api/routes/` — REST
- `backend/app/services/pipeline.py` — ingest → analyse → stems → loops
- `backend/app/services/isolation_service.py` — region extract / 5-band split / export
- `frontend/src/App.tsx` — view machine (`library | upload | processing | workspace | isolation`)
- `scripts/install-macos.sh` + `scripts/macos-app/` — Mac `.app` wrapper
- `docs/README.md` — current docs index. `docs/archive/` is historical.

## Product constraints

This is a just-me tool. Do not add accounts, cloud sync, LAN bind, or multi-tenant anything unless the owner asks.

## Hermes Bot Mode

This repo now ships a Bot Mode profile in `.hermes/`.

```bash
./scripts/install-hermes-bot.sh
hermes -p music-matters chat
```

Project-local skills: `.hermes/skills/`. Do not contradict the hard rules above.
