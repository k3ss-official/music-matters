# PEAK Ledger — Music Matters (`elite` Branch)

## Branch Audit & Collation Matrix

All remote branches, PR refs (`refs/pull/*/head`), and merge ancestors across `k3ss-official/music-matters` and `anwhelan01/music-matters` were examined and collated into branch `elite`:

| Ref / Commit | Lineage / Scope | Disposition in `elite` |
|---|---|---|
| `origin/pr/1` (`a8543c2`, `codex/summarize-project-status`) | Early lifespan hook on legacy root `app/main.py` | Superseded by `backend/app/main.py` lifespan & graceful shutdown in PR #4 (`24ecf03`) |
| `origin/pr/2` (`3dd0a0a`, `feature/repo-merger-v2`) | Unified v2.0 3-repo merger (`DJ Library Tool` + `DJ Sample Discovery` + `Music Matters`), Demucs 6-stem, Librosa/AllInOne analysis, Ableton/DAW export | Included in `main` ancestry; broken/unconfined routes (`export.py`, `search.py`, `ableton_exporter.py`, `analysis.py`, `processing.py`, `fingerprint.py`, `generate.py`) repaired and hardened in Cycles 2–4 |
| `3d11625` (`ag-may`) + `c7aa5f0` → `2e256d5` | `shazamio` recognizer, `ShazamImport` CSV parser, `ResourceChecker` / `StartupCheck`, `StoragePrompt`, `WaveformCanvas` media element caching | Included in `main` ancestry; broken `ShazamImport` job subscription and Upload view `NaN BPM` fixed in Cycle 3 |
| `origin/pr/3` (`3d49f1c`, `feature/isolation-workspace-mvp`, squash `99aca51`) | Dark-navy `mm-*` design system, `LibraryView.tsx` dashboard, 2-pane loop editor, `IsolationWorkspace` MVP (`ParentStemPanel`, `SubstemEQShaper`, `SubstemMixer`, `IsolationRightSidebar`) | Included in `main` ancestry; end-to-end track/stem hydration, real waveform peaks, stem selector, audio streaming (`/audio/{target}`), and custom export format/SR/bit-depth/grid-snap wired in Cycles 1, 4, and 5 |
| `origin/pr/4` (`de4f1a9`, `prod/hardening`, squash `24ecf03`) | `backend/app/security.py` (`confined_file`, `safe_name`, `copy_into_library`), SQLite WAL/FKs (`db.py`), `/api/library/stats`, `/api/library/tracks/{id}/peaks`, dead UI moved to `frontend/src/_unused`, CI workflow | Included in `main` ancestry; `confined_file` and `safe_name` extended across all remaining file-reading/writing routes in Cycles 2 & 4 |
| `origin/pr/5` (`ffb3e0c`, `feat/macos-app`, merged `bc1dbad`) | macOS `.app` bundle (`scripts/install-macos.sh`, `scripts/macos-app/`, `scripts/lib-env.sh`), `start.sh --app`, SPA static serving in `backend/app/main.py`, 5-band FFT substem split & mix/EQ export in `isolation_service.py` | Included in `main` ancestry; integrated with real track stems and export settings in Cycles 1, 4, and 5 |
| `24019ef` + `214f92e` + `97e9331` (`anwhelan01/music-matters` merge) | Hermes Bot Mode (`.hermes/`, `scripts/install-hermes-bot.sh`), concise `AGENTS.md`, `CLAUDE.md`, `docs/*.md` | Preserved in `elite` |

---

## Cycle 0 — Baseline & Verification Harness

```text
╔══════════════════════════════════════════════════════════════════╗
║  PEAK · CYCLE 0 · BASELINE                                       ║
╠══════════════════════════════════════════════════════════════════╣
║  Intent:   Examine all branches, collate the best of each into   ║
║            branch `elite`, and improve via PEAK until zero       ║
║            real defects remain.                                  ║
║  Harness:  1. /workspace/.venv/bin/pytest backend/tests          ║
║               --ignore=backend/tests/test_e2e.py -v              ║
║            2. cd /workspace/frontend && npx tsc --noEmit         ║
║               && npm run build                                   ║
║  Baseline: 24 passed in pytest; tsc 0 errors; Vite build passed  ║
║            with 1 dynamic-import chunking warning on             ║
║            isolationApi.ts.                                      ║
║  Plan:     C1 (reality): End-to-end IsolationWorkspace hydration ║
║                          from real track stems, audio playback,  ║
║                          preview mix, and custom export formats. ║
║            C2 (attacker): Enforce confined_file / safe_name path ║
║                          jail across all routes and fix broken   ║
║                          DAW / Ableton / custom-loop exports.    ║
║            C3 (operator + Cold Critic): Fix reslice_loops,       ║
║                          delete_track, search routes, Shazam     ║
║                          job tracking; run Cold Critic.          ║
║            C4 (premise): Fix all 5 Cold Critic findings (symlink ║
║                          escape, multi-SR stem mixing, region    ║
║                          clamping, grid_snap/loop_length, UI).   ║
║            C5 (verdict): Fix second Cold Critic pass (stale      ║
║                          substems on stem/region switch, chunked ║
║                          parent peak streaming, partial export   ║
║                          settings merge, search track cap).      ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Cycle 1 — `reality` Lens (`c32ce45`)

- **Defect (`ship-block`)**:
  1. `frontend/src/App.tsx:769` and `IsolationWorkspace.tsx:39` passed a track UUID string as `source_track_path`, left `parent_stem_path` unset, and passed `region_end: 0` when opening Isolation from the Library or Sidebar. `isolation_service.extract_region` and `split_substems` therefore always fell back to placeholder mode even on tracks with separated stems.
  2. `ParentStemPanel.tsx:27,63,99` hardcoded `PLACEHOLDER`, rendered fake waveform bars, had a non-functional `PLAY` button, and had no stem selector to switch between a track's separated stems (`drums`, `bass`, `vocals`, `guitar`, `piano`, `other`).
  3. `SubstemEQShaper.tsx:79` dynamically imported `../../services/isolationApi` while it was already statically imported across the bundle (triggering a Vite build warning) and dropped EQ updates when `active_eq_target === '__combined__'`.
  4. `isolation_service.py:390` (`export_loop`) ignored `session.export_settings` (`format`, `sample_rate`, `bit_depth`) and always wrote 24-bit WAV at the source sample rate.
- **Hypothesis**:
  Hydrating `IsolationSession` from `source_track_id` in `isolation_service.create_session` / `update_session`, adding `GET /api/isolation/session/{id}/audio/{target}` (`confined_file`-jailed), wiring real audio playback and stem switching in `ParentStemPanel` and `IsolationRightSidebar`, and honoring `format`/`sample_rate`/`bit_depth` in `export_loop` will make the Isolation Workspace operate on real track stems end-to-end and eliminate the Vite build warning.
- **Diff Summary**:
  - `backend/app/services/isolation_models.py`, `backend/app/services/isolation_service.py`, `backend/app/api/routes/isolation.py`
  - `frontend/src/types/isolation.ts`, `frontend/src/services/isolationApi.ts`, `frontend/src/components/isolation/{IsolationWorkspace,ParentStemPanel,SubstemEQShaper,IsolationRightSidebar}.tsx`, `frontend/src/App.tsx`
  - `backend/tests/test_isolation.py` (`test_session_hydrates_from_track_and_exports_custom_format`)
- **Receipt**:
  - Command: `/workspace/.venv/bin/pytest backend/tests --ignore=backend/tests/test_e2e.py -v && cd /workspace/frontend && npx tsc --noEmit && npm run build`
  - Exit code: `0` (`25 passed in 1.24s`; `tsc` 0 errors; `vite build` 0 warnings).
  - Status: **KEPT** (`c32ce45`).

---

## Cycle 2 — `attacker` Lens (`6559170`)

- **Defect (`ship-block`)**:
  1. Path-jail violations (`AGENTS.md` / `CLAUDE.md` hard rule: *"File serving and local ingest go through `backend/app/security.py` (`confined_file`, `safe_name`, `copy_into_library`)"*):
     - `backend/app/api/routes/library.py`: `loop_audio`, `stem_to_midi`, and `surgical_extract` did not validate paths with `confined_file` / `safe_name` and wrote outputs to `/tmp`.
     - `backend/app/api/routes/analysis.py`, `processing.py`, `fingerprint.py`, `generate.py`: accepted arbitrary host `audio_path` strings without `confined_file(settings.MUSIC_LIBRARY, ..., suffixes=AUDIO_SUFFIXES)`.
  2. `backend/app/api/routes/export.py`: `export_rekordbox`, `export_serato`, and `export_m3u` crashed with `500 AttributeError` because they called non-existent methods (`exporter.export_rekordbox`, `export_serato`, `export_m3u`) on `DAWExporter` and accepted unconfined `tracks` and `output_path`.
  3. `backend/app/services/ableton_exporter.py`: `_create_project_xml()` created empty `<ClipSlot>` elements without embedding `self.clips`, and did not reset `self.clips` across exports.
  4. `backend/app/services/pipeline.py`: `TrackRecord.to_detail()` raised `TypeError: got multiple values for keyword argument 'stems'`, and `extract_custom_loop` failed on short/synthetic audio due to `librosa.segment.agglomerative(k=None)` and `self._loop_records` list/dict mismatch.
- **Hypothesis**:
  Enforcing `confined_file` and `safe_name` across `library.py`, `export.py`, `analysis.py`, `processing.py`, `fingerprint.py`, and `generate.py`, wiring `export.py` to `DAWExporter.export_rekordbox_xml` / `export_serato_crates` / `export_m3u_playlist`, embedding `<AudioClip>` nodes in `AbletonExporter._create_project_xml`, and fixing `TrackRecord.to_detail()` + `extract_custom_loop` will close all path-confinement holes and make every export route work end-to-end.
- **Diff Summary**:
  - `backend/app/api/routes/{library,export,analysis,processing,fingerprint,generate}.py`
  - `backend/app/services/{ableton_exporter,pipeline}.py`, `backend/app/services/processing/{stem_separator,sample_extractor}.py`, `backend/app/services/analysis/audio_analyzer.py`
  - `backend/tests/test_hardening.py` (`test_routes_reject_paths_outside_music_library`, `test_daw_and_ableton_exports_work_and_enforce_confinement`)
- **Receipt**:
  - Command: `/workspace/.venv/bin/pytest backend/tests --ignore=backend/tests/test_e2e.py -v`
  - Exit code: `0` (`27 passed in 1.18s`).
  - Status: **KEPT** (`6559170`).

---

## Cycle 3 — `operator` Lens + Cold Critic (`e3d3cf9`)

- **Defect (`high`)**:
  1. `backend/app/services/pipeline.py:979` (`reslice_loops`): called `self._library.loops_dir(track.slug)` on a non-existent attribute `self._library` (`AttributeError`), ran synchronous file I/O on the event loop, omitted energy/tag calculation, and never persisted new loops to SQLite (`db.save_loop` / `db.save_track`).
  2. `backend/app/services/pipeline.py:338` (`delete_track`): left orphaned `projects/<slug>` directories, staged `downloads/<uuid>.wav` copies, and in-memory/SQLite `jobs` records when deleting a track.
  3. `backend/app/api/routes/search.py`: `SearchRequest` and `TrackSearchRequest` were orphaned after commit `512b280` removed `/api/search/artists` and `/api/search/tracks`, breaking `frontend/src/services/api.ts:299-305`.
  4. `frontend/src/App.tsx:642,810`: Upload view rendered `NaN BPM` when `t.bpm` was `null`, and `ShazamImport` `onIngest` never set `selectedTrackId` or subscribed to SSE/polling via `subscribeToActiveJob`.
- **Hypothesis**:
  Fixing `reslice_loops` (using `self._loops_dir`, `asyncio.to_thread`, energy/tag computation, and `db.save_loop`), cleaning up staged downloads/projects/jobs in `delete_track`, restoring `/api/search/artists`, `/api/search/artist`, and `/api/search/tracks`, and wiring `subscribeToActiveJob` in `App.tsx` will make loop reslicing, track deletion, library search, and Shazam import work reliably.
- **Diff Summary**:
  - `backend/app/services/pipeline.py`, `backend/app/api/routes/search.py`, `frontend/src/App.tsx`, `backend/tests/test_library_api.py`
- **Receipt**:
  - Command: `/workspace/.venv/bin/pytest backend/tests --ignore=backend/tests/test_e2e.py -v && cd /workspace/frontend && npx tsc --noEmit && npm run build`
  - Exit code: `0` (`28 passed in 2.50s`; `tsc` 0 errors; `vite build` 0 warnings).
  - Status: **KEPT** (`e3d3cf9`).
- **Cold Critic Sub-Agent (Cycle 3 Mandatory Check)**:
  Spawned fresh zero-context sub-agent (`bc-9d7341c0-0b09-5ec1-8d24-7a5590d74ae1`), which surfaced 5 concrete defects addressed in Cycle 4.

---

## Cycle 4 — `premise` Lens (`199456d`)

- **Defect (`ship-block` / `high`, surfaced by Cycle 3 Cold Critic)**:
  1. `backend/app/api/routes/export.py:242`: Ableton glob fallback (`stems_dir.glob("*.wav")`) bypassed `confined_file`, allowing a symlink inside `stems_dir` pointing outside `MUSIC_LIBRARY` to be packaged into `.als` archives.
  2. `backend/app/services/pipeline.py:1110`: `extract_custom_loop` mixed stems with different sample rates or channel counts without resampling or channel alignment.
  3. `backend/app/services/isolation_service.py:566`: `extract_region` accepted inverted or out-of-bounds `region_start` / `region_end` and silently wrote 1s of zeros while returning `"status": "extracted"`.
  4. `backend/app/services/isolation_service.py:480`: `export_loop` ignored `export_settings.loop_length_seconds` and `export_settings.grid_snap`.
  5. `frontend/src/components/isolation/IsolationRightSidebar.tsx:98`: `handleExport` set `exportState = 'success'` (`Exported!`) even when the backend returned `"status": "placeholder"` with `output_path: null`.
- **Hypothesis**:
  Confining every glob fallback candidate in `export_ableton`, resampling/aligning stems in `extract_custom_loop`, clamping/normalizing `[region_start, region_end]` against `total_dur` in `extract_region`, applying `loop_length_seconds` and `grid_snap` in `export_loop`, and checking `result.output_path` / `result.status` in `IsolationRightSidebar.tsx` will resolve all 5 Cold Critic defects.
- **Diff Summary**:
  - `backend/app/api/routes/export.py`, `backend/app/services/isolation_service.py`, `backend/app/services/pipeline.py`, `frontend/src/components/isolation/IsolationRightSidebar.tsx`
  - `backend/tests/test_hardening.py`, `backend/tests/test_isolation.py`
- **Receipt**:
  - Command: `/workspace/.venv/bin/pytest backend/tests --ignore=backend/tests/test_e2e.py -v && cd /workspace/frontend && npx tsc --noEmit && npm run build`
  - Exit code: `0` (`28 passed in 1.57s`; `tsc` 0 errors; `vite build` 0 warnings).
  - Status: **KEPT** (`199456d`).

---

## Cycle 5 — `verdict` Lens (`381ab46`)

- **Defect (`high` / `medium`, surfaced by Cycle 5 Cold Critic `bc-93dd682d-0d2b-5985-9345-5d211b8b6602`)**:
  1. `backend/app/services/isolation_service.py:335`: Changing `parent_stem_name`, `parent_stem_path`, `region_start`, or `region_end` via `PATCH /api/isolation/session/{id}` unlinked `extracted_region.wav` but left stale `sub_*.wav` files and `session.substems` in place, so `preview` or `export-loop` mixed FFT bands from the previous parent stem.
  2. `backend/app/services/isolation_service.py:194`: `_inspect_parent_stem` read the entire parent stem WAV into memory via `sf.read` just to compute 200 waveform peaks.
  3. `backend/app/services/isolation_models.py:92` & `isolation_service.py:315`: Partial `PATCH` of `export_settings` (e.g. `{"export_settings": {"format": "wav"}}`) overwrote unprovided fields (`loop_length_seconds`, `bpm`) with model defaults.
  4. `frontend/src/components/isolation/ParentStemPanel.tsx:160`: `handleExtract` did not sync normalized `region_start` / `region_end` back to parent React state.
  5. `backend/app/api/routes/search.py:66`: `GET /api/search/artists` appended unbounded track lists per artist bucket.
- **Hypothesis**:
  Clearing stale `sub_*.wav` and `substems` on parent/region change, streaming 200 seeked chunks via `sf.SoundFile` in `_inspect_parent_stem`, merging partial `UpdateExportSettingsRequest` fields in `update_session`, updating React state from `extractRegion` response in `ParentStemPanel.tsx`, and capping per-artist track previews in `search.py` will eliminate all remaining defects.
- **Diff Summary**:
  - `backend/app/services/isolation_models.py`, `backend/app/services/isolation_service.py`, `backend/app/api/routes/search.py`
  - `frontend/src/services/isolationApi.ts`, `frontend/src/components/isolation/ParentStemPanel.tsx`
  - `backend/tests/test_isolation.py`
- **Receipt**:
  - Command: `/workspace/.venv/bin/pytest backend/tests --ignore=backend/tests/test_e2e.py -v && cd /workspace/frontend && npx tsc --noEmit && npm run build`
  - Exit code: `0` (`28 passed in 1.86s`; `tsc` 0 errors; `vite build` 0 warnings).
  - Status: **KEPT** (`381ab46`).

---

## Stop Gate & Wraith Verification

- **Wraith Sub-Agent (`bc-daeac15c-ca4d-5882-8fad-3022952a638f`)**:
  Independently executed the full verification harness on branch `elite`, audited `git diff main..HEAD` and branch lineage, verified zero placeholder/stub leaks and clean working tree, and returned **`WRAITH_CLEAN`**.
