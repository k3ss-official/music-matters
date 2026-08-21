# HANDOFF — Music Matters

_Last updated: 2026-07-06_

## 1. Project overview
Local-first DJ automation platform: ingest → analyse (BPM/key) → stem-separate (demucs-mlx) → loop edit → export to DAW. FastAPI backend (port 8010) + React 18/Vite/Tailwind frontend (port 5173), SQLite DB, Apple M4 target, conda env `music-matters`.

## 2. Built today
**Isolation Workspace MVP** (earlier commits on this branch):
- Extract clean loops from bleed-heavy stems: region extract → split into 5 substems → mix/EQ → export loop
- `frontend/src/components/isolation/` — `IsolationWorkspace.tsx` (layout), `ParentStemPanel.tsx` (waveform/transport/region), `SubstemEQShaper.tsx` (5-band EQ — EQ lives ONLY here, never in mixer rows: non-negotiable), `SubstemMixer.tsx` (5 rows, solo/mute/gain), `IsolationRightSidebar.tsx` (audition mode + export settings)
- Backend: session CRUD works; **DSP is scaffold/placeholder** (extract, split, audition playback, export produce placeholder output)

**Dashboard overhaul** (commit `dbe8047`):
- New dark-navy design system: tokens in `frontend/tailwind.config.js` (`mm-*`: bg `#0d0f1c`, surface `#111328`, panel `#1a1830`, border `#2a2840`, purple `#7F77DD`, teal `#1D9E75`) + `frontend/src/index.css` (4px scrollbars, status-pulse anim)
- New `frontend/src/components/LibraryView.tsx` — default landing view: stats bar, search/filter/sort/import toolbar, track table (waveform thumbs, BPM, major/minor key badges, Raw/Stemming…/Stemmed status dots, per-row actions: microscope→Isolation, re-stem, export; disabled per status)
- `frontend/src/App.tsx` rewritten shell: 44px header (logo dot, breadcrumb, bell, avatar), persistent 52px icon sidebar (Library/Search/Tracks/Stems/Isolation/Export), view state machine `library|upload|processing|workspace|isolation` (no router)
- All 27 components hex-swapped from old neon palette to new tokens (incl. isolation; EQ panel untouched structurally)
- Status mapping (`LibraryView.tsx uiStatus()`): `stems_ready|loops_ready|project_ready|completed|done`→Stemmed, `queued|running|pending`→Stemming, else Raw

**Real vs placeholder:**
- Real: track list (`GET /api/library/tracks`), re-stem (`POST .../refresh`), stats Total/StemsReady/Processing, key badges, status dots, isolation session CRUD
- Placeholder (marked with comments): Loops Exported stat, duration column ("–:––"), waveform thumbnails (deterministic fakes from track_id), Stems/Export nav → workspace (no dedicated pages), isolation DSP

## 3. Current status
- Branch: `feature/isolation-workspace-mvp` (pushed)
- PR #3 OPEN: https://github.com/k3ss-official/music-matters/pull/3 — carries BOTH isolation MVP and dashboard overhaul; **not merged to main**
- `vite build` clean; `tsc` has pre-existing errors only (repo's tsc gate was already broken — e.g. `api.enqueueIngest` doesn't exist, unused imports)

## 4. Known gaps
- Loops Exported stat — no backend route
- Track duration — not in `/api/library/tracks` response
- Waveform thumbnails — fake; needs a peaks endpoint
- No dedicated Stems page (nav routes to workspace)

## 5. Todo / next steps
1. Merge PR #3
2. Wire real API: loop-export count route, duration in track list, waveform peaks endpoint
3. Real DSP for Isolation Workspace: extract-region → split-substems → audition preview → export (see `docs/isolation-workspace.md` for ordering constraint: split runs on extracted region, NOT full stem)
4. Traktor metadata integration (BPM from `import_traktor::TraktorEntry.bpm` → `CreateSessionRequest.bpm`; see docs)
5. Dedicated Stems page

## 6. How to run
```bash
./start.sh          # starts backend :8010 + frontend :5173
open http://localhost:5173
```
Conda env `music-matters` required (miniforge at `/opt/homebrew/Caskroom/miniforge/base/envs/music-matters`).
Note: Claude Code's preview_start tool hangs Vite in this repo (sandbox + external volume) — verify with manual `npx vite` + curl.

## 7. Key file map
| Area | Path |
|---|---|
| Frontend entry / shell / views | `frontend/src/App.tsx` |
| Library dashboard | `frontend/src/components/LibraryView.tsx` |
| Design tokens | `frontend/tailwind.config.js`, `frontend/src/index.css` |
| Isolation UI | `frontend/src/components/isolation/*.tsx` |
| Isolation API client | `frontend/src/services/isolationApi.ts`, types in `frontend/src/types/isolation.ts` |
| Main API client | `frontend/src/services/api.ts` (+ `sse.ts`) |
| Backend track/loop CRUD | `backend/app/api/routes/library.py` |
| Pipeline orchestrator | `backend/app/services/pipeline.py` |
| DB | `backend/app/services/db.py` (SQLite) |
| Docs | `docs/isolation-workspace.md`, `docs/ARCHITECTURE.md`, `docs/STATUS.md` |
| Project rules | `CLAUDE.md` (WaveSurfer v7 API constraints, commit convention, no audio files in git) |
