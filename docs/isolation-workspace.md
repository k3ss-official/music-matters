# Isolation Workspace

Extract a usable loop from a bleed-heavy stem: slice a region, split it into five frequency-band substems, mix / EQ, export WAV.

## Workflow

1. Import a track; wait until it is **Stemmed**
2. Library row → microscope, or workspace → Isolation in the sidebar
3. Set the region on the parent stem
4. **Extract Region** → `session/extracted_region.wav`
5. **Split Substems** → five bands **on the extracted region**, never the full parent
6. Mixer: solo / mute / gain. EQ lives only in the EQ shaper, not mixer rows
7. **Export Loop** → `session/export.wav` and a browser download

## Bands (FFT brickwall)

| Name | Hz |
|---|---|
| Low End | 20–150 |
| Mid Body | 150–600 |
| Harmonic | 600–2500 |
| High Transients | 2500–8000 |
| Ambient | 8000–Nyquist |

This is deterministic DSP, not a learned source-separation model. Sessions with no parent stem still return `status: "placeholder"` so tests and empty sessions stay valid.

## Storage

`$MUSIC_LIBRARY/Library/Isolation/<session-uuid>/`

- `session.json`
- `extracted_region.wav`
- `sub_1.wav` … `sub_5.wav`
- `preview.wav` / `export.wav`

Session ids are UUID; `safe_name()` rejects `..` in the id.

## API

See [API.md](API.md) — prefix `/api/isolation`.
