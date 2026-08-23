# Using the app

After [install](INSTALL.md), double-click **Music Matters** in `~/Applications`. The UI is a single window with a left rail.

## Views

| Rail | What it is |
|---|---|
| Library | Every ingested track. Duration, loop count, waveform thumb, Raw / Stemming / Stemmed |
| Upload | Drop a file, paste a URL / search query, batch queue, Traktor NML, Shazam CSV |
| Processing | Active jobs + SSE progress |
| Workspace | WaveSurfer loop editor, phrases, stems, Ableton export |
| Isolation | Region extract → 5-band split → mix/EQ → WAV |

Quit with the power button in the header (app mode only). That hits `POST /api/system/shutdown` on localhost.

## First track

1. Upload a WAV/MP3/FLAC, or paste a YouTube URL (needs FFmpeg).
2. Leave analysis + separation on. Loop slicing is optional.
3. Wait until the library row says **Stemmed**. First stem run downloads Demucs (~4 GB).
4. Click the row to open the workspace. Draw a region, snap to beats, save a loop.
5. Microscope icon (or Isolation in the rail) to pull a cleaner loop from a bleed-heavy stem. See [isolation-workspace.md](isolation-workspace.md).
6. Export: Ableton `.als` from the workspace, or Isolation **Export Loop** for a WAV.

Local files are **copied** into `~/music-matters/downloads/` under a UUID name. The original path is never streamed. Deleting a library row does not delete the file you dropped from.

## Library chips

| Chip | Pipeline status |
|---|---|
| Stemmed | `stems_ready`, `loops_ready`, `project_ready`, `completed`, `done` |
| Stemming | `queued`, `running`, `pending` |
| Raw | anything else (ingested / analysed / error) |

Errors show on the Processing view. Logs: `~/Library/Logs/Music Matters.log`.

## Keyboard / transport

Workspace uses the transport bar (play / stop / loop / volume). WaveSurfer v7 has no `play(start, end)` — looping is a time check on `audioprocess`.
