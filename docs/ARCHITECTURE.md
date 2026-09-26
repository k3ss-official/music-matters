# Architecture

Music Matters is a **local-first** FastAPI + React studio. One user, one machine, loopback only.

```
┌──────────────────┐     /api + /assets      ┌─────────────────────┐
│  UI              │ ◄──────────────────────► │  FastAPI            │
│  React 18 / Vite │   same origin in app     │  127.0.0.1:8010     │
│  WaveSurfer v7   │                          │  uvicorn            │
└──────────────────┘                          └─────────┬───────────┘
                                                        │
                          ┌─────────────────────────────┼─────────────────────────────┐
                          ▼                             ▼                             ▼
                   SQLite WAL                    MUSIC_LIBRARY                   optional ML
                   library.db                    copies / stems /                Demucs, MLX
                   tracks, loops, jobs           loops / isolation               analysis
```

## Layout

```
music-matters/                 # this clone
├── backend/app/               # FastAPI (run with cwd=backend or PYTHONPATH=backend)
│   ├── main.py                # lifespan, path jail, SPA mount of frontend/dist
│   ├── config.py              # pydantic-settings
│   ├── security.py            # confined_file, safe_name, localhost helpers
│   ├── api/routes/            # REST
│   └── services/              # pipeline, db, isolation, analysis, demucs
├── frontend/                  # React 18 + Tailwind 3 + WaveSurfer
│   ├── src/                   # live UI (Library, workspace, isolation)
│   ├── src/_unused/           # archived components, tsc-excluded
│   └── src-tauri/             # optional Tauri v2 shell
├── scripts/
│   ├── install-macos.sh
│   ├── macos-app/             # Info.plist + launcher
│   └── lib-env.sh             # conda / venv resolver
├── backend/tests/             # pytest (no live Demucs / YouTube)
└── docs/
```

## Runtime modes

| Mode | Command | UI | API |
|---|---|---|---|
| Dev | `./start.sh` | Vite `127.0.0.1:5173`, proxies `/api` | uvicorn `--reload` |
| App | `./start.sh --app` or the `.app` | FastAPI serves `frontend/dist` | uvicorn, no reload |

## Persistence

SQLite at `$MUSIC_LIBRARY/library.db` (`~/music-matters/library.db` by default).

- `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`
- Tables: `tracks`, `loop_records`, `jobs`
- Pipeline hydrates into memory on boot; incomplete jobs marked failed after restart

Isolation sessions are JSON files:

`$MUSIC_LIBRARY/Library/Isolation/<uuid>/session.json`

plus `extracted_region.wav`, `sub_N.wav`, `export.wav`.

## Pipeline (happy path)

1. **Ingest** — URL (yt-dlp), search query, or local file **copied** into `downloads/`
2. **Analysis** — BPM, key, duration, phrases (allin1 / librosa path)
3. **Separation** — Demucs `htdemucs_6s` (MPS / CUDA / CPU), HPSS fallback
4. **Loops** — optional beat-aligned slices
5. **Project** — `session.json` scaffold

Jobs run under `asyncio.Semaphore(MAX_CONCURRENT_JOBS)` (default 3). Progress is pushed over SSE `GET /api/stream/{job_id}/stream`.

## Frontend

No client-side router. `App.tsx` view machine: `library | upload | processing | workspace | isolation`.

Axios `baseURL: '/api'`. Job payloads are snake_case on the wire; `mapJob()` converts to camelCase.

## What this is not

Not SaaS. No accounts, no public bind, no multi-tenant DB. Security model is “this is your Mac.”
