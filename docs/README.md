# Music Matters Documentation

This directory captures how the Music Matters stack is wired together. Start here when orienting a new agent or contributor.

## Quick Links
- `ARCHITECTURE.md` – workspace layout, storage volumes, and service boundaries
- `PIPELINE.md` – ingest → analysis → separation → loop → project assembly sequence
- `AGENTS.md` – active MCP/Agents SDK roles, scopes, and safety clauses
- `API-SPEC.md` – REST entry points for automation clients
- `DEMUCS.md` – stem separation notes, models, and GPU guidance

## Environment Pillars
- `/Volumes/deep-1t/Users/k3ss/projects/music-matters` – fast SSD for code, virtualenvs, and transient artefacts
- `/Volumes/hotblack-2tb/mm-files` – durable audio library storing originals, stems, loops, caches, and exports

The repo focuses on code, configuration, and orchestration documents. All heavy audio assets stay on the `hotblack-2tb` volume and remain outside version control.

## Contributing Workflow
1. Update `config/settings.yaml` to point to your local volumes.
2. Run `uvicorn app.main:app --reload` for the HTTP interface or `scripts/run_demucs.py` for CLI separations.
3. Document new behaviours in the relevant file inside `docs/` and register any new agents.
4. Capture findings in the log stream at `/mm-files/cache/log-YYYYMMDD.json` for traceability.

“Do no harm. Never lie. If you don’t know — say so.”
