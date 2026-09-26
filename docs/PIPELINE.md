# Processing pipeline

Implemented in `backend/app/services/pipeline.py`. Stages are skipped when the ingest `ProcessingOptions` flags are off.

```
queue_ingest / upload
        │
        ▼
   ingest     copy or yt-dlp → MUSIC_LIBRARY/downloads/<uuid>.<ext>
        │
        ▼
   analysis   BPM, key, duration, beats, segments  (optional)
        │
        ▼
   separation Demucs 6-stem or HPSS fallback         (optional)
        │
        ▼
   loop       beat-aligned slices into loops_dir     (optional)
        │
        ▼
   project    projects/<slug>/session.json
```

Status on the track record moves through `queued → ingested → analysed → … → project_ready` (or `error`). Library dashboard maps:

| Pipeline status | Dashboard |
|---|---|
| `stems_ready`, `loops_ready`, `project_ready`, `completed`, `done` | Stemmed |
| `queued`, `running`, `pending` | Stemming |
| anything else | Raw |

Local ingest **never** keeps the user-supplied path as the stream source. `copy_into_library()` writes a UUID file under the library; `/api/audio/tracks/{id}` only serves files inside `MUSIC_LIBRARY`.

Jobs persist after every stage. On process start, `running`/`queued` rows become `failed` with detail `Job interrupted by server restart`.
