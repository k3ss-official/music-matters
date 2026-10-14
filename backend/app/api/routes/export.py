"""
Music Matters - DAW Export Routes
Export to Rekordbox, Serato, M3U playlists, Ableton
"""

import logging
from pathlib import Path
from typing import List
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.security import AUDIO_SUFFIXES, confined_file, safe_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export"])


class ExportRequest(BaseModel):
    tracks: List[str]  # List of track paths or track IDs
    output_path: str = "music_matters_export"
    format: str = "rekordbox"  # 'rekordbox', 'serato', 'm3u', 'json'


class AbletonExportRequest(BaseModel):
    track_id: str
    stems: List[str]  # Which stems to include
    start_time: float = 0
    end_time: float = 0


def _resolve_export_tracks(raw_tracks: List[str]):
    """Validate and convert track IDs or library-confined paths into ExportedTrack objects."""
    from app.services.export.daw_exporter import ExportedTrack
    from app.services.pipeline import pipeline

    if not raw_tracks:
        raise HTTPException(status_code=400, detail="No tracks specified for export")

    exported: List[ExportedTrack] = []
    for item in raw_tracks:
        track_rec = None
        try:
            track_uuid = UUID(item)
            track_rec = pipeline._tracks.get(track_uuid)
        except ValueError:
            track_rec = None

        if track_rec is not None:
            file_path = str(track_rec.original_path) if track_rec.original_path else ""
            raw_dur = track_rec.metadata.get("duration") if track_rec.metadata else None
            exported.append(
                ExportedTrack(
                    title=track_rec.title,
                    artist=track_rec.artist or "Unknown",
                    file_path=file_path,
                    bpm=float(track_rec.bpm or 120.0),
                    key=track_rec.musical_key or "C",
                    duration_seconds=float(raw_dur or 0.0),
                )
            )
            continue

        # Must be a confined audio file inside MUSIC_LIBRARY
        audio_path = confined_file(settings.MUSIC_LIBRARY, item, suffixes=AUDIO_SUFFIXES)
        matched = next(
            (r for r in pipeline._tracks.values() if r.original_path and r.original_path == audio_path),
            None,
        )
        if matched is not None:
            raw_dur = matched.metadata.get("duration") if matched.metadata else None
            exported.append(
                ExportedTrack(
                    title=matched.title,
                    artist=matched.artist or "Unknown",
                    file_path=str(audio_path),
                    bpm=float(matched.bpm or 120.0),
                    key=matched.musical_key or "C",
                    duration_seconds=float(raw_dur or 0.0),
                )
            )
        else:
            exported.append(
                ExportedTrack(
                    title=audio_path.stem,
                    artist="Unknown",
                    file_path=str(audio_path),
                    bpm=120.0,
                    key="C",
                    duration_seconds=0.0,
                )
            )
    return exported


def _resolve_export_name(raw_output_path: str, default_name: str) -> tuple[Path, str]:
    """Ensure export destination is confined to MUSIC_LIBRARY and return (export_dir, output_name)."""
    lib_root = settings.MUSIC_LIBRARY.expanduser().resolve()
    raw = Path(raw_output_path) if raw_output_path else Path(default_name)
    if raw.is_absolute():
        resolved = raw.expanduser().resolve(strict=False)
        try:
            resolved.relative_to(lib_root)
        except ValueError as exc:
            raise HTTPException(status_code=403, detail="Output path outside library") from exc
        export_dir = resolved.parent
    else:
        export_dir = lib_root / "exports"
        # Disallow relative traversal outside library
        candidate = (export_dir / raw).resolve(strict=False)
        try:
            candidate.relative_to(lib_root)
        except ValueError as exc:
            raise HTTPException(status_code=403, detail="Output path outside library") from exc

    export_dir.mkdir(parents=True, exist_ok=True)
    stem = safe_name(raw.stem or default_name)
    return export_dir, stem


@router.post("/rekordbox")
async def export_rekordbox(request: ExportRequest):
    """Export playlist to Rekordbox XML format."""
    from app.services.export.daw_exporter import Crate, DAWExporter

    exported_tracks = _resolve_export_tracks(request.tracks)
    export_dir, output_name = _resolve_export_name(request.output_path, "rekordbox_export")

    try:
        exporter = DAWExporter(export_dir)
        crate = Crate(name=output_name, tracks=exported_tracks)
        output_file = exporter.export_rekordbox_xml(crates=[crate], output_name=output_name)

        return {
            "success": True,
            "format": "rekordbox",
            "output_file": str(output_file),
            "track_count": len(exported_tracks),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/serato")
async def export_serato(request: ExportRequest):
    """Export playlist to Serato crate format."""
    from app.services.export.daw_exporter import Crate, DAWExporter

    exported_tracks = _resolve_export_tracks(request.tracks)
    export_dir, output_name = _resolve_export_name(request.output_path, "serato_export")

    try:
        exporter = DAWExporter(export_dir)
        crate = Crate(name=output_name, tracks=exported_tracks)
        output_file = exporter.export_serato_crates(crates=[crate], output_name=output_name)

        return {
            "success": True,
            "format": "serato",
            "output_file": str(output_file),
            "track_count": len(exported_tracks),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/m3u")
async def export_m3u(request: ExportRequest):
    """Export playlist to M3U format."""
    from app.services.export.daw_exporter import DAWExporter

    exported_tracks = _resolve_export_tracks(request.tracks)
    export_dir, output_name = _resolve_export_name(request.output_path, "playlist")

    try:
        exporter = DAWExporter(export_dir)
        output_file = exporter.export_m3u_playlist(
            tracks=exported_tracks, playlist_name=output_name
        )

        return {
            "success": True,
            "format": "m3u",
            "output_file": str(output_file),
            "track_count": len(exported_tracks),
        }
    except HTTPException:
        raise
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
        stem_clean = safe_name(stem)
        if stem_clean.lower().endswith(".wav"):
            stem_clean = stem_clean[:-4]
        for candidate in [
            stems_dir / f"{stem_clean}.wav",
            stems_dir / stem_clean,
        ]:
            if candidate.is_file():
                stem_files[stem_clean] = str(
                    confined_file(settings.MUSIC_LIBRARY, candidate, suffixes=AUDIO_SUFFIXES)
                )
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
