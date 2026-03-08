import os
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services.pipeline import pipeline

router = APIRouter(prefix="/audio", tags=["audio"])


@router.get("/tracks/{track_id}")
async def get_track_audio(track_id: str) -> FileResponse:
    try:
        track_uuid = UUID(track_id)
        track = pipeline.get_track(track_uuid)
        source_path_str = track.metadata.get("source_path")
        
        if not source_path_str:
            raise HTTPException(status_code=404, detail="Source path not found in metadata")
            
        source_path = Path(source_path_str)
        if not source_path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found on disk")
            
        return FileResponse(
            source_path, 
            media_type="audio/wav" if source_path.suffix.lower() == ".wav" else "audio/mpeg",
            headers={"Accept-Ranges": "bytes"}
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid track ID")
    except KeyError:
        raise HTTPException(status_code=404, detail="Track not found")


@router.get("/stems/{track_id}/{stem_name}")
async def get_stem_audio(track_id: str, stem_name: str) -> FileResponse:
    try:
        track_uuid = UUID(track_id)
        track = pipeline.get_track(track_uuid)
        
        stem_path_str = track.provenance.get("stems", {}).get(stem_name)
        if not stem_path_str:
            # Fallback path logic if not in provenance
            stem_path = pipeline._library.get_track_dir(track_uuid) / "stems" / f"{stem_name}.wav"
        else:
            stem_path = Path(stem_path_str)
            
        if not stem_path.exists():
            raise HTTPException(status_code=404, detail="Stem file not found on disk")
            
        return FileResponse(
            stem_path, 
            media_type="audio/wav",
            headers={"Accept-Ranges": "bytes"}
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid track ID")
    except KeyError:
        raise HTTPException(status_code=404, detail="Track not found")
