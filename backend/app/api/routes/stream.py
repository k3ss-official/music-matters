"""SSE stream endpoint for real-time job progress."""

from __future__ import annotations

import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.services.pipeline import pipeline

router = APIRouter(prefix="/stream", tags=["stream"])


@router.get("/{job_id}/stream")
async def job_stream(job_id: str) -> StreamingResponse:
    """Server-Sent Events stream for a specific job."""
    try:
        job_uuid = UUID(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Verify job exists
    try:
        pipeline.get_job(job_uuid)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    queue = await pipeline.subscribe(job_uuid)

    async def event_generator():
        try:
            # Send initial state immediately
            try:
                initial = pipeline.get_job(job_uuid)
                data = json.dumps(initial.model_dump(mode="json"))
                yield f"event: job_update\ndata: {data}\n\n"
            except KeyError:
                yield f"event: error\ndata: {{\"detail\": \"Job not found\"}}\n\n"
                return

            # Stream updates
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    data = json.dumps(event)
                    yield f"event: job_update\ndata: {data}\n\n"

                    # If job is terminal, send one last event and close
                    status = event.get("status", "")
                    if status in ("completed", "failed"):
                        yield f"event: job_done\ndata: {data}\n\n"
                        return
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield f": keepalive\n\n"
        finally:
            pipeline.unsubscribe(job_uuid, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
