# AGENTS.md — Music Matters

## Snapshot
- **Mission:** Automate ingest → stem separation → loop prep so DJs focus on selection, not grunt work.
- **Repo root:** `/Volumes/deep-1t/Users/k3ss/projects/music-matters`
- **Stack:** Python 3.12 · FastAPI · Librosa/Essentia · Demucs v4 (MPS) · SQLite metadata cache.
- **Key services:** Local file system (`/Volumes/hotblack-2tb/mm-files`), Demucs models, optional OpenAI agents via MCP.

## Directives
- Keep the tone razor-sharp like mainline Rae instructions; this project feeds live sets.
- Never commit audio assets or stems; anything in `Tracks/`, `tracks-new/`, `raw-to-be-done/` stays local.
- Treat Demucs weights as read-only binaries.
- Playground APIs are fine locally; no external API calls without flagging first.

## Workflow
- **Setup:** `pip install -e .`
- **Config:** copy `config/settings.example.yaml` → `config/settings.yaml`; adjust library paths. Optional `.env` overrides.
- **Run API:** `uvicorn app.main:app --reload --port 8010`
- **Tests:** `pytest -q`
- **CLI helpers:** `scripts/demucs_batch.sh` for batch separation, `scripts/loop_slicer.py` for loop regeneration.

## Knowledge Base
- `docs/architecture.md` — high-level system map.
- `docs/pipeline/*.md` — acquisition, analysis, separation flows.
- `docs/agents/*.md` — MPC agent wiring.
- `notes/` — active research threads and TODO dumps.

## Active Focus
- Maintain high coverage on `app/services/` (test debt flagged last sprint).
- Watch for GPU/MPS memory spikes when demucs runs concurrently; stagger jobs if >2 tracks.
- Known flaky tests: `tests/pipeline/test_loop_timings.py` intermittently fails on cold caches.

---
Template maintainer: k3ss · Drafted by Rae (Nov 2025)
