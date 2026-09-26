# Music Matters — Handover
> Updated: 2026-03-27 · Branch: main

---

## Done This Session (commits in order)

| Commit | What |
|--------|------|
| `36cfe6d` | Cap demucs-mlx RAM + Phase 1.4 HF_HOME SSD redirect |
| `7dae1a0` | Phase 1.2 — BeatNet replaces madmom in analysis chain |
| `d5fccd5` | Phase 0.3+0.4 — concurrent job limiting + graceful shutdown |
| `1d15b2f` | Restore lost UI changes + pipeline timeout + BOUNCE rename |
| `93ea8e3` | CDJ-style `[` `]` keys + wire stem transport to WaveSurfer |
| `0770a1e` | Restore bar presets + EDIT button + wire stem play + VU bars |
| `1c1d0f4` | Move bar presets + EDIT to TransportBar, kill BOUNCE |

---

## Current UI Layout

```
[ |< ] [ □ ] [ ▶ ] [ >| ] [LOOP]   00:00.000 / 03:15.004   130.4 BPM   [SNAP]   [4] [8] [16] [32] [EDIT]    ... zoom ... vol
──────────────────────────────────────────────────────────────────────────
                          WAVEFORM
──────────────────────────────────────────────────────────────────────────
         EditLoopSection (beat grid canvas) — shown when EDIT active
──────────────────────────────────────────────────────────────────────────
IN [<] 00:00.000 [>]   0.00s / 0 beats   [<] 00:00.000 [>] OUT       [SAVE LOOP]
──────────────────────────────────────────────────────────────────────────
STEMS: Drums / Bass / Vocals / Guitar / Piano / Other   [▶] [M] [S] per row
──────────────────────────────────────────────────────────────────────────
Phrases row (smart phrase detection pills)
```

---

## What Works ✅

- Upload → Processing view → Workspace transition
- WaveSurfer waveform: beat snap, drag regions, loop playback, zoom
- demucs-mlx 6-stem separation (htdemucs_6s)
- BeatNet beat/downbeat detection
- `[` = set loop IN at playhead, `]` = set loop OUT at playhead
- `I` / `O` same as `[` / `]`
- Space = play/pause, Esc = stop
- Bar presets 4/8/16/32 in TransportBar → snaps region, auto-loops, opens EDIT
- EDIT button in TransportBar → toggles beat grid canvas
- Stem mixer: M mute, S solo, ▶ solo+play (if not playing, starts WaveSurfer too)
- VU bars animate during playback
- WaveSurfer play/pause/seek drives all stem AudioContext nodes in sync (seek detected by >0.5s jump)
- Job queue: asyncio.Semaphore(3), graceful shutdown
- HF_HOME → /Volumes/MLX/cache (off boot drive)
- SQLite persistence (tracks/loops/jobs survive restarts)
- SSE real-time progress stream

---

## Known Remaining Issues ❌

1. **No track with real 6 stems yet** — user needs to re-upload. Last track had HPSS stems (3 stems) and was deleted. demucs-mlx segment fix is committed so next upload should produce drums/bass/vocals/guitar/piano/other.
2. **Stream router prefix conflict** — `jobs.py` and `stream.py` both use `prefix="/jobs"`. Fix: reorder in router.py or change stream prefix.
3. **Phase 1.3 not started** — Roformer vocal quality path.
4. **Phase 2+ not started** — Model registry, stem selection, SAM extraction.

---

## Production Plan Progress

```
Phase 0  ██████████  DONE  — SQLite, SSE, concurrency, graceful shutdown
Phase 1  ████████░░  75%   — demucs-mlx ✅, BeatNet ✅, HF_HOME ✅, Roformer ❌
Phase 2  ░░░░░░░░░░  0%    — Model registry, stem selection, SAM
Phase 3  ░░░░░░░░░░  0%    — Zustand, error boundaries, data integrity, export quality
Phase 4  ░░░░░░░░░░  0%    — ACE-Step, MIDI, chord overlay, stem→MIDI
```

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/app/services/pipeline.py` | Main orchestrator: ingest→analyse→separate→loop→project |
| `backend/app/services/analysis/mlx_analyzer.py` | allin1 → BeatNet → librosa fallback chain |
| `backend/app/config.py` | MUSIC_LIBRARY=~/music-matters, HF_HOME=/Volumes/MLX/cache |
| `backend/app/main.py` | FastAPI app, startup/shutdown hooks |
| `frontend/src/components/CentreWorkspace.tsx` | State owner: wires everything |
| `frontend/src/components/TransportBar.tsx` | Play/pause/stop/loop, bar presets, EDIT, zoom, snap, volume |
| `frontend/src/components/WaveformCanvas.tsx` | WaveSurfer v7 (MediaElement backend) |
| `frontend/src/components/LoopEditorToolbar.tsx` | IN/OUT nudge + SAVE LOOP only |
| `frontend/src/components/EditLoopSection.tsx` | Beat grid canvas (opened by EDIT or bar preset) |
| `frontend/src/components/StemLanes.tsx` | Stem rows: VU bars, ▶ M S |
| `frontend/src/hooks/useStemMixer.ts` | Web Audio API: per-stem gain nodes, lazy buffer loading |
| `frontend/src/hooks/useKeyboardShortcuts.ts` | All keyboard shortcuts |

---

## How to Start

```bash
conda activate music-matters
cd ~/k3ss-official/music-matters
./start.sh
# Backend:  http://localhost:8010/api/docs
# Frontend: http://localhost:5173
```

Data dir: `~/music-matters/` (library.db, downloads/, stems/, loops/)

## Next Directive

1. Re-upload a track → verify 6 real stems show in StemLanes
2. Test: play, stem ▶/M/S, VU bars, [ ] keys, bar presets, EDIT beat grid
3. Phase 1.3 — Roformer (see docs/PRODUCTION-PLAN.md §1.3)
4. Fix stream router prefix conflict (backend/app/api/router.py)

---
## Update 2026-03-27 (latest)

Added commits:
- `8b83ddb` mute WaveSurfer when stems loaded + zoom to region on EDIT

Fixes:
- **Double audio gone**: WaveSurfer is silenced when stems are present. Volume slider now routes to stemMixer.setMasterVolume. Stems = the audio.
- **EDIT zooms in**: clicking EDIT zooms the waveform to the loop region. Closing EDIT calls zoomFit to return to full track view.
- **Bar preset zooms in**: selecting 4/8/16/32 also zooms to the new loop region.

Next:
1. Test stem playback (no galloping horses double audio now)
2. Test EDIT zoom-in fine-tuning workflow
3. Test SAVE LOOP → check file saved to ~/music-matters/loops/
4. Phase 1.3 Roformer vocal quality path

---
## Update 2026-03-27 (session end)

Commit `64b2c14`:
- **Double audio fixed**: playGenRef counter in stemMixer + 30ms debounce on onPlayStateChange
- **Seek threshold fixed**: only backward jumps (loop restart) or >2s forward (user seek) trigger resync
- **Drag to create region**: `wsRegions.enableDragSelection()` now enabled in WaveformCanvas
- **Bar presets start from playhead**: `currentTime` used instead of `regionStart` 
- **SNAP button removed**: snap defaults off, no quantize
- **Bar presets no longer auto-open EDIT**: EDIT is an explicit button

Remaining:
1. Test full workflow (upload → stems → drag region → [ ] keys → bar presets → EDIT → SAVE)
2. Phase 1.3 Roformer
3. Stream router prefix conflict fix
