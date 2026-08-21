# Quickstart — 90 seconds

## 1. Launch

```bash
git clone https://github.com/k3ss-official/music-matters.git && cd music-matters
chmod +x start.sh && ./start.sh
```

Open **http://127.0.0.1:5173**. API: **http://127.0.0.1:8010/api/docs**.

`start.sh` uses conda env `music-matters` if present, otherwise a venv.

## 2. Ingest a track

Drop a WAV/MP3 on the Import page, or type an artist + title (e.g. `Bicep - Glue`) and ingest. Wait for stages to complete (Demucs is the slow one).

## 3. Explore

- Library shows duration, BPM, key, loop counts
- Open a track → waveform in the centre workspace
- Use **Smart Phrases** to snap the region to a chorus or drop
- Isolation workspace slices a region from a parent stem

## 4. Export

With a region selected, export to Ableton (`.als`). The file downloads via `/api/download-file` and must live inside your music library.

## Requirements

Python 3.11+, Node 18+, FFmpeg.
