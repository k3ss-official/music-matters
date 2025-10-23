# Processing Pipeline

## Overview
The Music Matters pipeline is a deterministic sequence that takes an audio source from ingestion to FL Studio assembly. Each stage publishes events so agents can monitor progress or resume interrupted runs.

## Stage 0 – Intake
- Accept local files dropped into the staging directory or remote URLs (YouTube, SoundCloud, Jamendo) requested through the API.
- `Fetch Agent` normalises filenames, records source metadata, and stores assets in `/mm-files/downloads/`.
- Duplicate detection uses audio fingerprints and existing SQLite records; duplicates get linked to the original entry instead of reprocessing.

## Stage 1 – Pre-Master Normalisation
- Convert to 48kHz/24-bit WAV using FFmpeg if necessary.
- Apply loudness normalisation to LUFS target (-14 default) for consistent separation performance.
- Persist updated asset in `library/originals/` and flag ingestion complete.

## Stage 2 – Analysis
- Librosa + Essentia extract BPM, key, time signature, energy, loudness, spectral centroid, and beat grid offsets.
- Store results as `metadata.json` alongside the source and push a summary record into SQLite.
- Confidence thresholds control whether manual review is required before proceeding.

## Stage 3 – Stem Separation
- `DemucsService` runs six-stem separation (`vocals`, `drums`, `bass`, `other`, `fx`, `synth`).
- Output directory: `/mm-files/stems/separated/{slug}/`.
- Each stem inherits the canonical naming convention `{remixer}-{trackkey}-{stem}.wav`.

## Stage 4 – Loop Generation
- Quantise using the analysed beat map.
- Slice 1, 2, 4, and 8-bar loops; export WAV snippets and `loops.json` manifest containing BPM, key, and origin stem.
- Store loops under `/mm-files/loops/generated/{slug}/`.

## Stage 5 – Project Assembly (Optional)
- Generate FL Studio `.flp` template with playlist lanes for each stem and loop bank channels.
- Drop relevant audio assets into `projects/fl-studio/{slug}/` with consistent markers and colour coding.

## Stage 6 – Export & Archive
- Optionally master and export final mixes to `projects/exports/`.
- Update library indexes and cache with final status (`processed`, `loops_ready`, `project_ready`).

## Observability
- Every stage emits log events to `/mm-files/cache/log-YYYYMMDD.json`.
- WebSocket feed pushes `job_id`, `stage`, `progress`, and `eta` so UI dashboards can react.
- Failures capture stack traces and relevant config to simplify re-runs.

## Reprocessing Strategy
- Jobs are idempotent: re-running the pipeline checks for existing outputs and only recomputes missing or stale stages.
- Metadata timestamps inform whether upstream changes (e.g. updated normalisation settings) require downstream regeneration.

## Human-in-the-Loop Points
- Flag low-confidence BPM/key detections for manual correction.
- Allow manual tagging of licensing or usage rights before stems/loops leave the sandbox.
- Provide quick accept/reject flows for automatically generated loops to fine-tune slicing heuristics.
