# Music Matters

Music Matters is a local-first DJ and producer automation stack. It ingests source tracks, separates stems with Demucs, auto-slices loops, and exposes a FastAPI orchestration layer that other tools (FL Studio, frontends, or agents) can call. The goal is to eliminate the prep grind so humans stay focused on selection and creative recomposition.

## Key Capabilities
- **Acquisition**: yt-dlp/SoundCloud adapters pull high quality audio or ingest local files into a managed library.
- **Analysis**: Librosa and Essentia pipeline extracts BPM, key, bar map, and confidence metrics into structured metadata.
- **Separation**: Demucs v4 (MPS) generates six-stem bundles ready for loop slicing or arrangement.
- **Loop Generation**: Pydub-based slicer produces bar-aligned loops with tags so DAW sessions can be assembled automatically.
- **Operator UX**: OpenAI Agents SDK + MCP keep automation explainable, sandboxed, and auditable; FastAPI exposes the same operations over HTTP.

## Repository Layout
```
app/            FastAPI application, service layers, and agent orchestration glue
config/         Versioned configuration templates and environment guides
docs/           Architecture, pipeline, agents, and runbooks
scripts/        CLI helpers for Demucs and batch jobs
tests/          Pytest contract tests (health checks, smoke suites)
```

The audio library lives outside the repo on `/Volumes/hotblack-2tb/mm-files` and is never committed. Source intake staging (e.g. `Tracks/`, `tracks-new/`, `raw-to-be-done/`) stays local and is git-ignored by default.

## Getting Started
1. **Install dependencies**
   ```bash
   pip install -e .
   ```
2. **Configure paths**
   - Copy `config/settings.example.yaml` to `config/settings.yaml` and adjust workspace/library paths.
   - Duplicate `.env.example` to `.env` if you need to override settings via environment variables.
3. **Run the API**
   ```bash
   uvicorn app.main:app --reload --port 8010
   ```
4. **Call the API**
   ```bash
   curl http://localhost:8010/health
   ```

## Documentation
- `docs/ARCHITECTURE.md` – system architecture, directories, and agent topology
- `docs/PIPELINE.md` – end-to-end job lifecycle from download through FL Studio handoff
- `docs/API-SPEC.md` – REST endpoints and payload schemas
- `docs/DEMUCS.md` – separation models, performance notes, and GPU guidance
- `docs/AGENTS.md` – Agent manifests and MCP role boundaries

## Next Steps
- Implement ingestion + metadata persistence service
- Connect Demucs runner to async task queue so separations can run concurrently
- Flesh out loop slicer and FL Studio template generator
- Stand up SQLite schema for dedupe and provenance tracking

“Less menu diving, more music.”
