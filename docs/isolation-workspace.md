# Isolation Workspace — Feature Documentation

**Working names:** *Isolation Workspace* (official feature name), *Sound Hunter* / *Stem Microscope* (user-facing aliases under consideration)

## Purpose

The Isolation Workspace is a DJ/producer tool for extracting clean, usable loops
from contaminated or bleed-heavy stems.

A common problem: you split a track into stems, but the vocal stem still has
snare bleed, or the bass stem has kick punch you don't want. Standard tools let
you mute whole stems but not re-split them. The Isolation Workspace solves this
by breaking a parent stem into sub-components (substems) that you can
solo/mute/gain-adjust/EQ independently, then export as a clean mixed loop.

## DJ Workflow

1. Import a track → let Music Matters split stems (Demucs)
2. In the workspace, set a loop region on the timeline
3. Click **Isolation** in the left nav (or the header button)
4. A new Isolation Session is created automatically
5. Click **Extract Region** → slices the parent stem at your loop boundaries (produces `extracted_region.wav`)
6. Click **Split Substems** → runs sub-splitting on the *extracted region only* (not the full parent stem), producing 5 sub-components
7. In the **Substem Mixer**, solo/mute/adjust gain per row to audition combinations
8. In the **Active Substem EQ / Shaper**, select a target (Sub 1–5 or Combined)
   and sculpt the frequency content with the 5-band EQ faders
9. In the **Right Sidebar**, pick your Audition Mode and Export Settings
10. Click **Export Loop** → downloads a WAV file of the selected + EQ'd substems

## Correct Extraction Architecture

The critical ordering constraint for DSP implementation:

```
select region
    ↓
extract_region  →  parent_stem[region_start:region_end]  →  session/extracted_region.wav
    ↓
split_substems  →  sub-splitter(extracted_region.wav)  →  session/sub_1.wav … sub_5.wav
```

**NOT** this (incorrect — wasteful and architecturally wrong):
```
split_substems  →  sub-splitter(full_parent_stem.wav)  →  then slice each sub to region
```

Why it matters: running Demucs (or any sub-splitter) on the full parent stem
for every session would cost minutes of GPU time per operation. Slicing first
reduces the input to the region duration (typically 4–32 bars) and makes the
operation proportional to what the user actually selected. The session directory
stores `extracted_region.wav` as the canonical input; all downstream sub-files
derive from it.

## Why Sounds Span Multiple Substems

Audio source separation (Demucs) is imperfect. A kick drum might appear in both
the "drums" and "other" stems. A synth pad might bleed into "guitar". The Isolation
Workspace treats these bleed artefacts as a feature: by exposing each component
as its own gain/EQ-able channel, you can subtract or reduce the unwanted part
without completely losing the wanted part.

## Why EQ Is in the Top Panel, Not in Rows

**NON-NEGOTIABLE UX RULE: EQ controls live only in the Active Substem EQ / Shaper
panel — never in the substem rows.**

Reason: EQ is a *focused editing action* that requires visual space and attention.
Cramming 5 faders into already-dense mixer rows creates accidental edits, cognitive
overload, and accessibility issues. The DJ workflow is sequential: you pick a target
in the top panel, you sculpt it, then you move on. This mirrors every physical mixer
and DAW mixer design convention.

## Non-Destructive Storage

Isolation sessions are saved under:
```
<MUSIC_LIBRARY>/Library/Isolation/<session_id>/session.json
```

Original source tracks and stems are **never modified**. The session JSON stores
all gain/EQ/selection state. When DSP export is implemented, the output WAV will
be written to the same session directory as a new file, not in-place.

## MVP Status

**This is an MVP scaffold.** The following is real:
- Session creation, persistence, and retrieval (FastAPI + JSON files)
- 5-band EQ model (stored and returned by API)
- Per-substem solo/mute/gain/select state
- Audition mode selection
- Export settings (format/sample rate/bit depth/grid snap) stored
- All API endpoints return correct structured responses

**The following is placeholder** (marked `is_placeholder: true` in the API,
`[PLACEHOLDER]` badge in the UI):
- Substem waveform peaks are mathematically generated, not from real audio
- No actual sub-splitting DSP — substems are named "Low End / Mid Body /
  High Transients / Harmonic / Ambient" as a UX preview of the intended workflow
- Playback/audition doesn't produce audio — UI buttons exist but don't play back
- Export does not render a WAV file — the endpoint returns the export intent as JSON
- Region extraction doesn't slice audio — it returns the region boundaries as JSON
- The "Combined EQ" target applies to a single substem in this MVP (future: true mix)

## Traktor / External DJ Analysis Metadata — Feasibility

### What the repo already has

| Capability | Status | Location |
|---|---|---|
| Traktor NML collection parser | **Fully working** | `backend/app/services/import_traktor.py` |
| Traktor NML import API endpoint | **Fully working** | `POST /api/ingest/traktor-nml` |
| Rekordbox XML **export** | **Fully working** | `backend/app/services/export/daw_exporter.py` |
| Serato crate **export** | Working (route) | `POST /api/export/serato` |
| librosa BPM / beat tracking | **Present** | `backend/app/services/fingerprint/audio_fingerprint.py` |
| allin1 (MLX) beats/key/chords/structure | **Present** | `backend/app/services/analysis/mlx_analyzer.py` |
| Rekordbox XML **import** | Not implemented | — |
| Serato crate **import** | Not implemented | — |
| Hot cue / memory cue import (any platform) | Not implemented | — |

### What Traktor provides that is directly useful for Isolation

The `import_traktor.py` parser extracts two fields per track:

- **BPM** — human-confirmed value (Traktor sets `BPM_QUALITY="100"` after the
  DJ analyzes and/or manually corrects it). More reliable than our allin1/librosa
  estimates on tracks with tempo fluctuations, live recordings, or unusual meters.
- **INIZIO** — beatgrid anchor in seconds (position of bar 1, beat 1). With BPM
  and INIZIO known, every bar boundary in the track is computable:
  `bar_N_start = anchor + N * bars_per_beat * (60 / bpm)`.

For the Isolation Workspace this means: if a track has been analyzed in Traktor,
we can pre-populate `region_start` and `region_end` to snap exactly to bar
boundaries the DJ has already verified — no estimation needed, no manual nudging.

### Feasibility verdict

| Use case | Feasibility | Effort |
|---|---|---|
| Auto-populate BPM from Traktor collection | **High — works today** | Wire `import_traktor::TraktorEntry.bpm` into `CreateSessionRequest.bpm` |
| Auto-snap region to Traktor beatgrid | **High** | Expose `beatgrid_anchor` from track metadata (already stored after NML import) |
| Import Rekordbox cue/loop points | **Medium** | Need to write an XML import parser (Rekordbox XML schema is public) |
| Import Serato hot cues | **Low** | Serato stores metadata in ID3 GEOB tags — parseable but undocumented |
| Import Engine DJ (Denon) cues | **Low** | Proprietary SQLite DB per library — feasible but significant reverse-engineering |

### Recommended next step

When DSP is wired, the `IsolationSession` create endpoint should accept an
optional `track_id`. If provided, the backend should look up `beatgrid_anchor`
from the track's metadata (written there by the Traktor NML import flow) and
use it to pre-compute musically aligned region boundaries. This requires zero
new infrastructure — the pipeline already stores `beatgrid_anchor` in
`track.metadata` after a successful `POST /api/ingest/traktor-nml` call.

## Next DSP Steps

Steps follow the correct extraction-first sequence:

1. **Region extraction**: in `extract_region()`, load `parent_stem_path` with
   soundfile, slice samples `[region_start*sr : region_end*sr]`, write to
   `session_dir/extracted_region.wav`. Return the output path in the response.
2. **Real sub-splitting**: in `split_substems()`, run Demucs (or a frequency-band
   model like `mdx_extra`) on `extracted_region.wav` — never on the full parent
   stem. Store outputs as `session_dir/sub_1.wav … sub_5.wav`, set
   `Substem.file_path` and `is_placeholder=False`.
3. **Real waveform peaks**: read each `sub_N.wav`, downsample amplitude envelope
   to 200 samples, write to `Substem.waveform_peaks`.
4. **Traktor beatgrid integration**: if `source_track_id` is provided, read
   `track.metadata["beatgrid_anchor"]` (written by the Traktor NML import) and
   use it with the track BPM to pre-snap `region_start`/`region_end` to bar boundaries.
5. **Playback**: serve each sub file via `/audio/` endpoint, load into WaveSurfer v7,
   wire solo/mute via Web Audio GainNode per substem.
6. **EQ rendering**: apply BiquadFilterNode chain (5 bands) in Web Audio during
   audition; mirror the same coefficients server-side for export consistency.
7. **Export**: mix down selected substems with gain/EQ applied via scipy/numpy,
   write to `session_dir/export_<timestamp>.wav`, return download URL.
8. **Artifact score**: cross-correlate substems to surface bleed (e.g. kick energy
   appearing in the "harmonic" substem) — flag via `Substem.implementation_status`.

## Manual Test Checklist (no test framework yet for frontend)

- [ ] Navigate to Isolation from workspace header button or left nav icon
- [ ] Isolation Workspace loads with "Creating isolation session…" spinner
- [ ] Session loads with Parent Stem Panel (fake waveform, transport buttons, info strip)
- [ ] Click "Split Substems" → 5 substem rows appear in the mixer
- [ ] Each row has: checkbox, colour strip, name, mini waveform, S, M, gain slider, dB readout, VU meter
- [ ] Checking a row checkbox → row highlights and name appears in Right Sidebar "Combined Output"
- [ ] Solo button (S) → other rows become dim (hasSolo logic)
- [ ] Mute button (M) → row becomes dim, VU meter empties
- [ ] Gain slider → dB readout updates, slider fills with substem colour
- [ ] Sub 1–5 buttons in EQ panel highlight when clicked; faders update that substem's EQ
- [ ] EQ fader click → dB readout changes colour (green=boost, red=cut, grey=zero)
- [ ] Bypass button toggles EQ bypass state
- [ ] Reset EQ button → all EQ bands zero
- [ ] Audition Mode buttons → active button highlights cyan
- [ ] Export Settings dropdowns → update on change
- [ ] Export Loop with no substems selected → button is disabled
- [ ] Export Loop with substems selected → loading state → success message
- [ ] Left nav Tracks/Isolation icons switch views correctly
- [ ] Header "Isolation" button (workspace view) switches to isolation view
