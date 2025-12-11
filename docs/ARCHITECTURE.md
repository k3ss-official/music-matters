# Architecture

## System Vision
Music Matters is an agent-orchestrated production environment. FastAPI exposes the workflow over HTTP, while OpenAI Agents + MCP govern long-running tasks and filesystem actions. Demucs, Librosa, and auxiliary tooling sit behind service interfaces so the automation surface stays clean and auditable.

## Component Stack
| Layer            | Responsibilities                                       | Tooling                               |
|------------------|--------------------------------------------------------|----------------------------------------|
| API & Orchestration | Task queue entrypoints, job status, logging            | FastAPI, Pydantic, HTTPX               |
| Separation       | GPU-accelerated six-stem renders                       | Demucs v4 (PyTorch MPS)                |
| Analysis         | BPM, key, waveform, and bar map extraction             | Librosa, Essentia, NumPy               |
| Looping          | Beat-aligned slicing, tagging, FL Studio export prep   | Pydub, custom quantisation logic       |
| Metadata Store   | Track provenance, dedupe signatures, agent actions     | SQLite, JSON cache                     |
| Agent Control    | Declarative command surface with scoped permissions    | OpenAI Agents SDK, MCP (filesystem, browser) |

## Directory Layout
```
/Volumes/deep-1t/Users/k3ss/projects/music-matters
├── app/                # FastAPI app + service layers
├── config/             # Checked-in templates (*.example.*)
├── docs/               # Architecture, pipeline, agent manifests
├── scripts/            # Operational helpers (Demucs runner, linters)
├── tests/              # Pytest suites
└── .venv/              # Local virtual environment (ignored)

/Volumes/hotblack-2tb/mm-files
├── library/
│   ├── originals/      # Ingested sources (free-first policy)
│   ├── processed/      # Mastered or normalised mixes
│   └── archive/        # Retired inputs
├── stems/
│   ├── separated/      # Demucs six-stem bundles per track
│   └── sample-packs/   # External or purchased stems
├── loops/
│   ├── generated/      # Auto-sliced loops w/ metadata annotations
│   └── custom/         # Hand-curated collections
├── projects/
│   ├── fl-studio/      # Auto-generated FLP sessions
│   └── exports/        # Final bounces
├── cache/              # Metadata JSON, waveform fingerprints, agent logs
└── downloads/          # yt-dlp / SC payloads awaiting ingestion
```

## Agent Surfaces
- **REST API Agent** — exposes `/api/v1/*` endpoints; orchestrates long running jobs, returns job IDs.
- **FileOps Agent** — server-filesystem MCP with access to the project repo (`deep-1t`) and audio library (`hotblack-2tb`). Can read/write touched assets, never create new directories outside scope.
- **Fetch Agent** — Python adapter bridging yt-dlp and SoundCloud API, always preferring free sources before paid APIs.
- **Compute Runner** — dispatches Demucs, Librosa, Essentia workloads; produces stem bundles and `metadata.json` payloads.
- **Browser Agent** — Chrome DevTools MCP used for dashboards or scraping metadata when API access is unavailable.
- **Pool Connector Agent** *(Phase 2 placeholder)* — Beatport, BPM Supreme, ZipDJ connectors. Disabled until production license keys are stored.

## Logging & Audit
Every agent writes a structured record (timestamp, agent, action, path, status, metrics) to `/mm-files/cache/log-YYYYMMDD.json`. These logs are source-of-truth for provenance and debugging. Long-running tasks should stream progress updates over WebSockets for UI clients, while metadata is stored in SQLite for fast lookup.

## Safety Model
1. Do not delete or export without explicit human approval.
2. Never run commands outside declared runtimes.
3. Keep heavy payloads outside the repository; push only code, configs, and docs.
4. Treat all environment variables as placeholders until human operator injects secrets locally.

## Roadmap Highlights
1. Implement an ingestion queue that normalises audio, stores provenance, and triggers downstream jobs automatically.
2. Introduce background workers (Celery, RQ, or a light custom queue) to offload Demucs + analysis from the main FastAPI process.
3. Tighten metadata schema (track UUIDs, BPM confidence, key detection heuristics, licensing flags).
4. Automate FL Studio project templating once stems and loops are available.
