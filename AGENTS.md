# AGENTS.md — Music Matters v2.0

## Snapshot
- **Mission:** Automate ingest → stem separation → loop prep so DJs focus on selection, not grunt work.
- **Repo root:** `/Volumes/deep-1t/Users/k3ss/projects/music-matters`
- **Stack:** Python 3.12 · FastAPI · Librosa · Demucs v4 (MPS) · Pydantic Settings.
- **Conda env:** `music-matters`
- **Key services:** Local file system (`~/Music Matters`), Demucs models.

## Directives
- Keep the tone razor-sharp; this project feeds live sets.
- Never commit audio assets or stems — `.gitignore` covers `*.wav`, `*.mp3`, `*.flac`, `*.m4a`.
- Treat Demucs weights as read-only binaries.
- No external API calls without flagging first.

## Workflow
- **Setup:** `conda activate music-matters && pip install -e .`
- **Config:** `backend/.env` for path overrides. `config/settings.yaml` for app settings.
- **Run API:** `cd backend && uvicorn app.main:app --reload --port 8010`
- **Run Frontend:** `cd frontend && npm run dev`
- **Tests:** `pytest -q`

## Project Structure
- `backend/app/main.py` — FastAPI application entry point.
- `backend/app/config.py` — unified configuration (Pydantic Settings).
- `backend/app/api/routes/` — all API route modules.
- `backend/app/services/` — business logic (search, analysis, processing, pipeline, etc.).
- `frontend/src/App.tsx` — main React UI.
- `frontend/src/components/` — React components.
- `frontend/src/services/api.ts` — API client.
- `docs/` — architecture, pipeline, API spec documentation.

## Active Focus
- Maintain high coverage on `backend/app/services/` (test debt flagged last sprint).
- Watch for GPU/MPS memory spikes when Demucs runs concurrently; stagger jobs if >2 tracks.
- Integrate `UploadPanel` and `TrackHistory` components into `App.tsx`.
- Wire up `ProcessingOptions` from frontend → backend so users can choose pipeline stages.

---
Template maintainer: k3ss · Updated March 2026
