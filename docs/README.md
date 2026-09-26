# Music Matters — documentation

Local-first DJ / producer studio. Code lives in this repo. Audio lives in `~/music-matters` (override with `MUSIC_LIBRARY`). The API binds `127.0.0.1` only.

| Doc | What it covers |
|---|---|
| [INSTALL.md](INSTALL.md) | Clone, Mac app, Terminal, requirements |
| [USAGE.md](USAGE.md) | First track, views, library chips |
| [MACOS-APP.md](MACOS-APP.md) | How `~/Applications/Music Matters.app` is built and launched |
| [LIBRARY.md](LIBRARY.md) | On-disk layout of `~/music-matters` |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, layout, data flow |
| [PIPELINE.md](PIPELINE.md) | Ingest → analysis → stems → loops → project |
| [API.md](API.md) | REST + SSE as the app actually exposes them |
| [isolation-workspace.md](isolation-workspace.md) | Isolation workspace (region → 5-band split → export) |
| [SECURITY.md](SECURITY.md) | Path jail, localhost bind, kill allowlist |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Tests, CI, conventions |
| [DEMUCS.md](DEMUCS.md) | Stem models and devices |

Live OpenAPI: `http://127.0.0.1:8010/api/docs` while the app is running.

Agent briefs: [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md).

`docs/archive/` is historical (old volume paths, `/api/v1`, agent-orchestrator drafts). Do not treat it as current.
