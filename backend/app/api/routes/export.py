"""
Music Matters - DAW Export Routes
Export to Rekordbox, Serato, M3U playlists, Ableton
"""

import logging
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from uuid import UUID
from pathlib import Path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export"])


class ExportRequest(BaseModel):
    tracks: List[str]  # List of track paths
    output_path: str
    format: str  # 'rekordbox', 'serato', 'm3u', 'json'


class AbletonExportRequest(BaseModel):
    track_id: str
    stems: List[str]  # Which stems to include
    start_time: float = 0
    end_time: float = 0


@router.post("/rekordbox")
async def export_rekordbox(request: ExportRequest):
    """Export playlist to Rekordbox XML format."""
    from app.services.export.daw_exporter import get_daw_exporter

    try:
        exporter = get_daw_exporter()
        output_file = exporter.export_rekordbox(
            tracks=request.tracks, output_path=request.output_path
        )

        return {
            "success": True,
            "format": "rekordbox",
            "output_file": str(output_file),
            "track_count": len(request.tracks),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/serato")
async def export_serato(request: ExportRequest):
    """Export playlist to Serato crate format."""
    from app.services.export.daw_exporter import get_daw_exporter

    try:
        exporter = get_daw_exporter()
        output_file = exporter.export_serato(
            tracks=request.tracks, output_path=request.output_path
        )

        return {
            "success": True,
            "format": "serato",
            "output_file": str(output_file),
            "track_count": len(request.tracks),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/m3u")
async def export_m3u(request: ExportRequest):
    """Export playlist to M3U format."""
    from app.services.export.daw_exporter import get_daw_exporter

    try:
        exporter = get_daw_exporter()
        output_file = exporter.export_m3u(
            tracks=request.tracks, output_path=request.output_path
        )

        return {
            "success": True,
            "format": "m3u",
            "output_file": str(output_file),
            "track_count": len(request.tracks),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ableton")
async def export_ableton(request: AbletonExportRequest):
    """Export stems to Ableton Live project (.als)"""
    from app.services.ableton_exporter import get_ableton_exporter
    from app.services.pipeline import pipeline
    from app.config import settings

    try:
        track_uuid = UUID(request.track_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid track ID")

    try:
        track = pipeline.get_track(track_uuid)
    except KeyError:
        raise HTTPException(status_code=404, detail="Track not found")

    # Resolve stems directory from track record
    from app.services.pipeline import pipeline as _pipeline
    track_record = _pipeline._tracks.get(track_uuid)
    if not track_record:
        raise HTTPException(status_code=404, detail="Track record not found")
    if track_record.stems_dir:
        stems_dir = track_record.stems_dir
    else:
        stems_dir = settings.resolved_stems_dir / track_record.slug

    stem_files = {}
    for stem in request.stems:
        stem_clean = stem.replace(".wav", "")
        for candidate in [
            stems_dir / f"{stem_clean}.wav",
            stems_dir / stem_clean,
        ]:
            if candidate.exists():
                stem_files[stem_clean] = str(candidate)
                break

    # Fallback: use all WAV files in stems dir
    if not stem_files and stems_dir.exists():
        for wav in stems_dir.glob("*.wav"):
            stem_files[wav.stem] = str(wav)

    if not stem_files:
        raise HTTPException(status_code=400, detail="No stem files found")

    try:
        exporter = get_ableton_exporter()

        output_dir = settings.resolved_loops_dir / "ableton"
        output_dir.mkdir(parents=True, exist_ok=True)

        output_file = output_dir / f"{track_record.slug}_ableton.als"

        exporter.export(
            output_path=output_file,
            stem_files=stem_files,
            track_title=track_record.title,
            bpm=float(track.bpm or 120.0),
            start_time=request.start_time,
            end_time=request.end_time,
        )

        return {
            "success": True,
            "format": "ableton",
            "output_file": str(output_file),
            "stem_count": len(stem_files),
            "download_url": f"/api/download-file?path={output_file}",
        }
    except Exception as e:
        logger.exception("Ableton export failed")
        raise HTTPException(status_code=500, detail=str(e))
