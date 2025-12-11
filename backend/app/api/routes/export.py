"""
Music Matters - DAW Export Routes
Export to Rekordbox, Serato, M3U playlists
"""
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/export", tags=["export"])


class ExportRequest(BaseModel):
    tracks: List[str]  # List of track paths
    output_path: str
    format: str  # 'rekordbox', 'serato', 'm3u', 'json'


@router.post("/rekordbox")
async def export_rekordbox(request: ExportRequest):
    """Export playlist to Rekordbox XML format."""
    from app.services.export.daw_exporter import get_daw_exporter
    
    try:
        exporter = get_daw_exporter()
        output_file = exporter.export_rekordbox(
            tracks=request.tracks,
            output_path=request.output_path
        )
        
        return {
            "success": True,
            "format": "rekordbox",
            "output_file": str(output_file),
            "track_count": len(request.tracks)
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
            tracks=request.tracks,
            output_path=request.output_path
        )
        
        return {
            "success": True,
            "format": "serato",
            "output_file": str(output_file),
            "track_count": len(request.tracks)
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
            tracks=request.tracks,
            output_path=request.output_path
        )
        
        return {
            "success": True,
            "format": "m3u",
            "output_file": str(output_file),
            "track_count": len(request.tracks)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
