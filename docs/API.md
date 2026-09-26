# HTTP API

Base: `http://127.0.0.1:8010/api`  
Interactive: `http://127.0.0.1:8010/api/docs`

There is **no `/api/v1` prefix**. There is no auth. Every mutating “dangerous” route is localhost-only or path-jailed.

## Health

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ status, version, app_mode, features }` |
| GET | `/api/health` (router alias) | `{ status, version, app_mode }` |

`app_mode` is true when `MM_APP_MODE=1`.

## Ingest

| Method | Path |
|---|---|
| POST | `/api/ingest` and `/api/ingest/ingest` |
| POST | `/api/ingest/upload` (multipart, audio only, 200 MB) |
| POST | `/api/ingest/batch` (max 50 queries) |
| POST | `/api/ingest/traktor-nml` |
| POST | `/api/ingest/shazam-history` |

Body for JSON ingest: `{ "source": "url-or-query-or-local-path", "tags": [], "collection": "", "options": { "analysis", "separation", "loop_slicing", "mastering" } }`.

Returns `{ job_id, track_id, stage: "queued" }` (HTTP 202).

## Jobs

| Method | Path |
|---|---|
| GET | `/api/jobs/active` |
| GET | `/api/jobs/{job_id}` |
| POST | `/api/jobs/process` |
| GET | `/api/stream/{job_id}/stream` | SSE `job_update` / `job_done` (snake_case) |

## Library

| Method | Path |
|---|---|
| GET | `/api/library/stats` |
| GET | `/api/library/tracks` |
| GET | `/api/library/tracks/{id}` |
| GET | `/api/library/tracks/{id}/peaks?buckets=200` |
| DELETE | `/api/library/tracks/{id}` |
| POST | `/api/library/tracks/{id}/refresh` |
| GET | `/api/library/tracks/{id}/loops` |
| POST | `/api/library/tracks/{id}/loops/reslice` |
| GET | `/api/library/tracks/{id}/loops/{loop_id}/audio` |
| POST | `/api/library/tracks/{id}/loops/custom` |
| GET | `/api/library/tracks/{id}/phrases` |
| POST | `/api/library/tracks/{id}/stems/{stem}/midi` |
| POST | `/api/library/tracks/{id}/extract` |
| POST | `/api/library/search` |

`TrackSummary` includes `duration`, `loop_count`, `stems`.

## Audio

| Method | Path |
|---|---|
| GET | `/api/audio/tracks/{id}` |
| GET | `/api/audio/stems/{id}/{stem}` |
| GET | `/audio/{path}` | library-relative, audio suffixes only |
| GET | `/api/download-file?path=` | absolute path inside library; export suffixes; never `library.db` |

## Isolation

Prefix `/api/isolation`.

| Method | Path |
|---|---|
| POST | `/session` |
| GET / PATCH | `/session/{id}` |
| POST | `/session/{id}/extract-region` |
| POST | `/session/{id}/split-substems` |
| PATCH | `/session/{id}/substem/{substem_id}` |
| POST | `/session/{id}/preview` |
| POST | `/session/{id}/export-loop` |

Without a parent stem, extract/split stay `status: "placeholder"`. With a library WAV, extract writes `extracted_region.wav` and split writes five band WAVs.

## System (localhost)

| Method | Path |
|---|---|
| GET | `/api/system/resources` |
| POST | `/api/system/kill/{pid}` | refuse pid 0/1/self/ppid; allowlisted app names |
| POST | `/api/system/shutdown` | SIGTERM after 400 ms |

## Also mounted

Search, analysis (Camelot, mashup score), fingerprint / Shazam-style recognize, DAW export (Ableton / Rekordbox / Serato / M3U), MIDI APC mapping, ACE-Step generate — see OpenAPI.
