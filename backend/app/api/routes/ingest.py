"""Ingest endpoints."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel as _BaseModel

from app.api.schemas import IngestRequest, IngestResponse, ProcessingOptions
import json
from app.config import settings
from app.services.pipeline import pipeline

router = APIRouter(prefix="/ingest", tags=["ingest"])


class BatchIngestRequest(_BaseModel):
    queries: list[str]
    options: ProcessingOptions = ProcessingOptions()
    collection: str | None = None
    tags: list[str] = []


class BatchIngestResponse(_BaseModel):
    jobs: list[IngestResponse]
    total: int


@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def enqueue_ingest(payload: IngestRequest) -> IngestResponse:
    try:
        return pipeline.queue_ingest(payload)
    except ValueError as exc:  # pragma: no cover - placeholder
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/upload", response_model=IngestResponse, status_code=202)
async def upload_and_ingest(
    file: UploadFile = File(...),
    tags: str | None = Form(None),
    collection: str | None = Form(None),
    options: str | None = Form(None),  # JSON string
) -> IngestResponse:
    """Upload an audio file and ingest it into the pipeline."""
    try:
        # Save uploaded file to downloads directory
        downloads_dir = settings.resolved_downloads_dir
        downloads_dir.mkdir(parents=True, exist_ok=True)

        # Sanitize filename
        safe_filename = "".join(
            c for c in file.filename or "upload.wav" if c.isalnum() or c in "._- "
        )
        file_path = downloads_dir / safe_filename

        # Write file
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Parse tags
        tag_list = [t.strip() for t in tags.split(",")] if tags else []

        # Parse options if provided
        processing_options = ProcessingOptions()
        if options:
            try:
                opts_dict = json.loads(options)
                processing_options = ProcessingOptions(**opts_dict)
            except (json.JSONDecodeError, TypeError):
                # Fallback to default if invalid
                pass

        # Queue ingestion
        payload = IngestRequest(
            source=str(file_path), 
            tags=tag_list, 
            collection=collection or "uploads",
            options=processing_options
        )
        return pipeline.queue_ingest(payload)

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


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


# ---------------------------------------------------------------------------
# Traktor NML beatgrid import
# ---------------------------------------------------------------------------

@router.post("/traktor-nml")
async def import_traktor_nml(
    nml: UploadFile = File(...),
    reslice: bool = False,
):
    """
    Import beatgrid data from a Traktor Pro collection.nml file.

    Upload your Traktor ``collection.nml`` (found in
    ``~/Documents/Native Instruments/Traktor X.Y/``).  The endpoint matches
    each entry to a library track by filename, writes the Traktor BPM and
    beatgrid anchor (INIZIO) into the track's metadata, and returns a report.

    Set ``?reslice=true`` to automatically re-slice loops for every matched
    track using the imported anchor — this makes loops line up exactly where
    Traktor's grid says bar 1 is.

    The data Traktor uses:
    - **BPM** — the confirmed tempo
    - **INIZIO** — the beatgrid anchor in seconds (position of bar 1, beat 1)
    """
    import tempfile

    suffix = Path(nml.filename or "collection.nml").suffix or ".nml"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await nml.read())
        tmp_path = Path(tmp.name)

    try:
        from app.services.import_traktor import parse_traktor_nml, match_and_apply

        entries = parse_traktor_nml(tmp_path)
        report = match_and_apply(entries, pipeline)

        if reslice and report["matched_count"] > 0:
            import asyncio
            from uuid import UUID

            resliced: list[str] = []
            for m in report["matched"]:
                try:
                    tid = UUID(m["track_id"])
                    await pipeline.reslice_loops(tid, bar_length=4)
                    resliced.append(m["track_id"])
                except Exception as exc:
                    pass  # non-fatal — report still useful
            report["resliced"] = resliced

        return report
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        tmp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Shazam history CSV import
# ---------------------------------------------------------------------------

@router.post("/shazam-history")
async def import_shazam_history(
    csv_file: UploadFile = File(...),
):
    """
    Import track history from a Shazam CSV export.

    Handles both known Shazam export formats:
    - Web export (shazam.com): first line is "Shazam Library", headers on line 2:
      Index, TagTime, Title, Artist, URL, TrackKey
    - App export (iOS): headers on line 1:
      Title, Artist, Date Shazamed, Shazam Link, Apple Music Link
    """
    import csv
    import io

    content = await csv_file.read()
    text = content.decode("utf-8-sig")  # handle BOM from Excel/iOS export
    lines = text.splitlines()

    # Detect web export: first line is bare "Shazam Library" with no commas
    if lines and lines[0].strip().lower() == "shazam library":
        lines = lines[1:]  # skip the banner, real headers are on line 2

    reader = csv.DictReader(io.StringIO("\n".join(lines)))
    tracks = []
    seen = set()

    for row in reader:
        # Web format: Title, Artist, TagTime, URL, TrackKey
        # App format: Title, Artist, Date Shazamed, Shazam Link, Apple Music Link
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

        # Deduplicate by title+artist
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
