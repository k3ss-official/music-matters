# API Specification

Version: `v0.1`
Base URL: `http://localhost:8000/api/v1`

## Authentication
Phase 1 runs locally without auth. Phase 2 will add token-based auth (FastAPI dependencies) when remote clients are introduced.

## Endpoints

### Health
- `GET /health`
- Response: `{"status": "ok", "version": "0.1.0"}`

### Jobs
- `POST /jobs/ingest`
  - Body:
    ```json
    {
      "source": "https://youtube.com/...",
      "tags": ["house", "classic"],
      "collection": "test-batch"
    }
    ```
  - Response:
    ```json
    {
      "job_id": "uuid",
      "stage": "queued"
    }
    ```

- `POST /jobs/process`
  - Body:
    ```json
    {
      "track_id": "uuid",
      "stages": ["analysis", "separation", "loop"],
      "priority": "normal"
    }
    ```
  - Response:
    ```json
    {
      "job_id": "uuid",
      "stage": "scheduled"
    }
    ```

- `GET /jobs/{job_id}`
  - Response:
    ```json
    {
      "job_id": "uuid",
      "status": "running",
      "progress": 0.45,
      "current_stage": "separation",
      "eta": "2025-01-17T18:21:00Z"
    }
    ```

### Library
- `GET /library/tracks`
  - Query params: `limit`, `offset`, `status`
  - Response: list of track metadata records.

- `GET /library/tracks/{track_id}`
  - Response: metadata + available assets + audit log pointers.

- `POST /library/tracks/{track_id}/refresh`
  - Triggers a re-run of missing stages. Useful if metadata schema changed.

### Agents (Diagnostics)
- `GET /agents`
  - Provides current agent registry, scopes, and heartbeat status.

### WebSocket
- `GET /ws/jobs/{job_id}`
  - Streams job progress events (`stage`, `percent`, `message`).

## Error Model
```
{
  "detail": {
    "code": "track_not_found",
    "message": "No track registered for id ...",
    "retryable": false
  }
}
```

## Rate Limits
Local deployment: none. Future remote deployments should enforce per-API keys or per-agent quotas.

## Versioning Strategy
- Breaking changes will bump the base path to `/api/v2` while keeping `/api/v1` available temporarily.
- Schema changes are communicated via `docs/API-SPEC.md` and OpenAPI auto-generation from FastAPI.
