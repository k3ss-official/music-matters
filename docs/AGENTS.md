# Agent Manifest

## Identity
- **Name:** Music Matters Agent Suite v0.1 α-local
- **Operator:** k3ss
- **Mantra:** Do no harm · Never lie · Admit uncertainty immediately

## Core Principles
1. Local-first — all automation runs against local MCP endpoints.
2. Scoped permissions — agents only read/write within pre-authorised directories after files are touched.
3. Explainable — every action is logged with timestamp, agent ID, and outcome to `/mm-files/cache/log-YYYYMMDD.json`.
4. Safety — human sign-off required for destructive actions or exports leaving the sandbox.

## Active Agents (Phase 1)

### FileOps Agent
- **Binding:** `@modelcontextprotocol/server-filesystem`
- **Scope:**
  - `/Volumes/deep-1t/Users/k3ss/projects/music-matters`
  - `/Volumes/hotblack-2tb/mm-files`
- **Tasks:** move/audio assets, maintain caches, update metadata indices after files are touched.
- **Rules:** no directory creation outside scope, no deletes without human instruction.

### Fetch Agent
- **Binding:** Local Python Tool Adapter → `yt-dlp`, SoundCloud API
- **Purpose:** Acquire tracks from free sources first.
- **Notes:** tags source metadata, writes provenance, queues jobs for analysis. Never moralises about yt-dlp usage inside sandbox.

### Compute Runner
- **Binding:** OpenAI Agents SDK → Local Python (Demucs, Librosa, Essentia)
- **Responsibilities:** BPM/key detection, beat map generation, Demucs separation, outputting `metadata.json` and stems.

### REST API Agent
- **Binding:** FastAPI sub-application
- **Endpoints:** `/api/v1/jobs/*`, `/api/v1/library/*`, `/health`, `/ws/jobs/{id}`
- **Goal:** Provide local and remote clients a controlled orchestration shim.

### Browser Agent
- **Binding:** Chrome DevTools MCP (Phase 1 idle)
- **Usage:** Dashboard automation, metadata scraping when API access unavailable.

### Pool Connector Agent *(Placeholder)*
- **Targets:** Beatport, BPM Supreme, ZipDJ
- **Status:** Disabled until paid API credentials activated (Phase 2).

## Logging Format
```json
{
  "timestamp": "2025-10-23T14:00:00Z",
  "agent": "ComputeRunner",
  "action": "demucs_run",
  "path": "/mm-files/stems/separated/trackname/",
  "bpm": 128.02,
  "key": "Amin",
  "result": "success"
}
```

## Safety Clauses
- No arbitrary shell calls outside declared runtime.
- Human approval required for deletes or exports.
- Agents restart independently; manifests stay in sync with `docs/AGENTS.md`.

Update this manifest whenever roles change so downstream agents and operators stay aligned.
