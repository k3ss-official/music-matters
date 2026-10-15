import mimetypes
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings
from app.security import AUDIO_SUFFIXES, confined_file
from app.services.pipeline import pipeline

router = APIRouter(prefix="/audio", tags=["audio"])


def _audio_media_type(path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".wav":
        return "audio/wav"
    if suffix == ".mp3":
        return "audio/mpeg"
    if suffix == ".flac":
        return "audio/flac"
    if suffix in (".m4a", ".aac"):
        return "audio/mp4"
    if suffix == ".ogg":
        return "audio/ogg"
    return mimetypes.guess_type(str(path))[0] or "audio/wav"


@router.get("/tracks/{track_id}")
@router.get("/{track_id}")
async def get_track_audio(track_id: str) -> FileResponse:
    try:
        track_uuid = UUID(track_id)
        track = pipeline.get_track(track_uuid)
        rec = pipeline._tracks.get(track_uuid)

        source_path_str = (
            track.metadata.get("source_path")
            or track.metadata.get("source")
            or (str(rec.original_path) if rec and rec.original_path else None)
        )

        if not source_path_str:
            raise HTTPException(
                status_code=404, detail="Source path not found in metadata"
            )

        source_path = confined_file(
            settings.MUSIC_LIBRARY, source_path_str, suffixes=AUDIO_SUFFIXES
        )
        return FileResponse(
            source_path,
            media_type=_audio_media_type(source_path),
            headers={"Accept-Ranges": "bytes"},
        )
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid track ID")
    except KeyError:
        raise HTTPException(status_code=404, detail="Track not found")


@router.get("/stems/{track_id}/{stem_name}")
async def get_stem_audio(track_id: str, stem_name: str) -> FileResponse:
    try:
        track_uuid = UUID(track_id)
        stem_path = pipeline.get_stem_path(track_uuid, stem_name)
        stem_path = confined_file(
            settings.MUSIC_LIBRARY, stem_path, suffixes=AUDIO_SUFFIXES
        )
        return FileResponse(
            stem_path,
            media_type=_audio_media_type(stem_path),
            headers={"Accept-Ranges": "bytes"},
        )
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid track ID")
    except KeyError:
        raise HTTPException(status_code=404, detail="Track not found")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Stem '{stem_name}' not found")
