"""Ingest endpoints."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel as _BaseModel

from app.api.schemas import IngestRequest, IngestResponse, ProcessingOptions
from app.config import settings
from app.security import AUDIO_SUFFIXES
from app.services.pipeline import pipeline

router = APIRouter(prefix="/ingest", tags=["ingest"])

MAX_UPLOAD_BYTES = 200 * 1024 * 1024


class BatchIngestRequest(_BaseModel):
    queries: list[str]
    options: ProcessingOptions = ProcessingOptions()
    collection: str | None = None
    tags: list[str] = []


class BatchIngestResponse(_BaseModel):
    jobs: list[IngestResponse]
    total: int


async def enqueue_ingest(payload: IngestRequest) -> IngestResponse:
    try:
        return pipeline.queue_ingest(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


router.add_api_route(
    "", enqueue_ingest, methods=["POST"], response_model=IngestResponse, status_code=202
)
router.add_api_route(
    "/ingest",
    enqueue_ingest,
    methods=["POST"],
    response_model=IngestResponse,
    status_code=202,
)


@router.post("/upload", response_model=IngestResponse, status_code=202)
async def upload_and_ingest(
    file: UploadFile = File(...),
    tags: str | None = Form(None),
    collection: str | None = Form(None),
    options: str | None = Form(None),  # JSON string
) -> IngestResponse:
    """Upload an audio file and ingest it into the pipeline."""
    suffix = Path(file.filename or "upload.wav").suffix.lower()
    if suffix not in AUDIO_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported audio type")

    downloads_dir = settings.resolved_downloads_dir
    downloads_dir.mkdir(parents=True, exist_ok=True)
    dest = downloads_dir / f"{uuid.uuid4().hex}{suffix}"

    written = 0
    try:
        with dest.open("wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    dest.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413, detail="File too large (max 200MB)"
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Upload failed") from exc

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    processing_options = ProcessingOptions()
    if options:
        try:
            opts_dict = json.loads(options)
            processing_options = ProcessingOptions(**opts_dict)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    payload = IngestRequest(
        source=str(dest),
        tags=tag_list,
        collection=collection or "uploads",
        options=processing_options,
    )
    try:
        return pipeline.queue_ingest(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/batch", response_model=BatchIngestResponse, status_code=202)
async def batch_ingest(payload: BatchIngestRequest) -> BatchIngestResponse:
    """Enqueue multiple ingest jobs in one call. Each query is a URL or text search."""
    if not payload.queries:
        raise HTTPException(status_code=400, detail="queries list must not be empty")
    if len(payload.queries) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 queries per batch")

    jobs: list[IngestResponse] = []
    errors: list[str] = []

    for query in payload.queries:
        try:
            req = IngestRequest(
                source=query.strip(),
                tags=payload.tags,
                collection=payload.collection,
                options=payload.options,
            )
            job = pipeline.queue_ingest(req)
            jobs.append(job)
        except Exception as exc:
            errors.append(f"{query!r}: {exc}")

    if not jobs:
        raise HTTPException(
            status_code=500,
            detail=f"All {len(payload.queries)} queries failed: {'; '.join(errors[:3])}",
        )

    return BatchIngestResponse(jobs=jobs, total=len(jobs))


@router.post("/traktor-nml")
async def import_traktor_nml(
    nml: UploadFile = File(...),
    reslice: bool = False,
):
    """Import beatgrid data from a Traktor Pro collection.nml file."""
    import tempfile

    suffix = Path(nml.filename or "collection.nml").suffix or ".nml"
    if suffix.lower() not in {".nml", ".xml"}:
        raise HTTPException(status_code=400, detail="Expected a .nml or .xml file")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await nml.read())
        tmp_path = Path(tmp.name)

    try:
        from app.services.import_traktor import parse_traktor_nml, match_and_apply

        entries = parse_traktor_nml(tmp_path)
        report = match_and_apply(entries, pipeline)

        if reslice and report["matched_count"] > 0:
            from uuid import UUID

            resliced: list[str] = []
            for m in report["matched"]:
                try:
                    tid = UUID(m["track_id"])
                    await pipeline.reslice_loops(tid, bar_length=4)
                    resliced.append(m["track_id"])
                except Exception:
                    pass
            report["resliced"] = resliced

        return report
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Traktor import failed") from exc
    finally:
        tmp_path.unlink(missing_ok=True)


@router.post("/shazam-history")
async def import_shazam_history(
    csv_file: UploadFile = File(...),
):
    """Import track history from a Shazam CSV export."""
    import csv
    import io

    content = await csv_file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="CSV too large")
    text = content.decode("utf-8-sig")
    lines = text.splitlines()

    if lines and lines[0].strip().lower() == "shazam library":
        lines = lines[1:]

    reader = csv.DictReader(io.StringIO("\n".join(lines)))
    tracks = []
    seen = set()

    for row in reader:
        title = (row.get("Title") or row.get("title") or "").strip()
        artist = (row.get("Artist") or row.get("artist") or "").strip()
        shazam_link = (
            row.get("URL") or row.get("Shazam Link") or
            row.get("url") or row.get("shazam_link") or ""
        ).strip()
        date_shazamed = (
            row.get("TagTime") or row.get("Date Shazamed") or
            row.get("tagtime") or row.get("date_shazamed") or ""
        ).strip()

        if not title:
            continue

        key = f"{title.lower()}|{artist.lower()}"
        if key in seen:
            continue
        seen.add(key)

        tracks.append({
            "title": title,
            "artist": artist,
            "date_shazamed": date_shazamed,
            "shazam_link": shazam_link,
            "search_query": f"{artist} {title}".strip(),
        })

    return {
        "tracks": tracks,
        "total": len(tracks),
        "message": f"Parsed {len(tracks)} tracks from Shazam export",
    }
