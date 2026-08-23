# Development

Python 3.11, Node 18+. Tests assume `PYTHONPATH=backend`.

```bash
pip install -e ".[dev]"
pytest backend/tests --ignore=backend/tests/test_e2e.py
cd frontend && npx tsc --noEmit && npm run build
```

`backend/tests/conftest.py` sets `MUSIC_LIBRARY` to a temp dir **before** importing the app so tests never touch `~/music-matters`.

`test_e2e.py` needs a live server (`MM_BASE_URL`). CI ignores it.

CI (`.github/workflows/ci.yml`): Ubuntu, Python 3.11, Node 20, pytest without Demucs/YouTube, `tsc` + `vite build`.

## Conventions

- Do not invent `/api/v1`. Prefix is `/api`.
- New file-serving routes must call `confined_file`.
- Frontend job objects: map snake_case at the boundary (`mapJob`).
- Dead UI goes in `frontend/src/_unused` (already in `tsconfig` exclude).
- `start.sh` is the dev launcher; `scripts/install-macos.sh` is the product launcher.
- Agent instructions: [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md). Keep them in sync with this file.

## Optional Tauri

`frontend/package.json` and `src-tauri` are Tauri **v2**. `npm run tauri:dev` still expects the backend on :8010. The Mac `.app` wrapper is the supported desktop path and does not need Rust.

## Docs drift

If you change a route, a bind address, or the installer, update `docs/API.md` / `docs/MACOS-APP.md` / `README.md` in the same commit. `docs/archive/` is not current.
