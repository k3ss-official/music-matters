# Isolation Workspace — Feature Documentation

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
5. Click **Split Substems** to break the parent stem into 5 sub-components
6. In the **Substem Mixer**, solo/mute/adjust gain per row to audition combinations
7. In the **Active Substem EQ / Shaper**, select a target (Sub 1–5 or Combined)
   and sculpt the frequency content with the 5-band EQ faders
8. In the **Right Sidebar**, pick your Audition Mode and Export Settings
9. Click **Export Loop** → downloads a WAV file of the selected + EQ'd substems

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

## Next DSP Steps

1. **Real sub-splitting**: run Demucs again on the parent stem with a different model
   (e.g. `mdx_extra` on isolated frequency bands) to produce real audio files per substem
2. **Real waveform peaks**: read actual audio samples and downsample to N peaks
3. **Playback**: use WaveSurfer v7 on each substem file, wire solo/mute via Web Audio
4. **EQ rendering**: apply biquad filter chain (Web Audio BiquadFilterNode × 5) in
   real-time during audition
5. **Export**: mix down selected substems with gain/EQ applied via a server-side
   scipy/numpy render pipeline, write WAV to session directory, return download URL
6. **Artifact score**: implement bleed detection metric (cross-correlation between
   substems) to surface which substems contain unwanted bleed from other sources

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
