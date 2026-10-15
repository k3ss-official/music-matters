"""Isolation Workspace API routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings
from app.security import AUDIO_SUFFIXES, confined_file
from app.services.isolation_models import (
    CreateSessionRequest,
    IsolateElementRequest,
    IsolationSession,
    SaveCompleteBundleRequest,
    UpdateSessionRequest,
    UpdateSubstemRequest,
)
from app.services.isolation_service import isolation_service

router = APIRouter(prefix="/isolation", tags=["isolation"])


def _require_session(session_id: str) -> IsolationSession:
    session = isolation_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found")
    return session


@router.post("/session", response_model=IsolationSession, status_code=201)
async def create_session(payload: CreateSessionRequest) -> IsolationSession:
    return isolation_service.create_session(
        source_track_id=payload.source_track_id,
        source_track_path=payload.source_track_path,
        parent_stem_path=payload.parent_stem_path,
        parent_stem_name=payload.parent_stem_name,
        region_start=payload.region_start,
        region_end=payload.region_end,
        bpm=payload.bpm,
        key=payload.key,
        export_settings=payload.export_settings,
    )


@router.get("/session/{session_id}", response_model=IsolationSession)
async def get_session(session_id: str) -> IsolationSession:
    return _require_session(session_id)


@router.patch("/session/{session_id}", response_model=IsolationSession)
async def update_session(session_id: str, payload: UpdateSessionRequest) -> IsolationSession:
    _require_session(session_id)
    updates = payload.model_dump(exclude_none=True)
    if "export_settings" in updates and updates["export_settings"] is not None:
        updates["export_settings"] = payload.export_settings.model_dump() if payload.export_settings else None
    if "master_eq_8band" in updates and updates["master_eq_8band"] is not None:
        updates["master_eq_8band"] = payload.master_eq_8band.model_dump() if payload.master_eq_8band else None
    updated = isolation_service.update_session(session_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found")
    return updated


@router.post("/session/{session_id}/extract-region")
async def extract_region(session_id: str) -> dict:
    _require_session(session_id)
    return isolation_service.extract_region(session_id)


@router.post("/session/{session_id}/split-substems", response_model=IsolationSession)
async def split_substems(session_id: str) -> IsolationSession:
    _require_session(session_id)
    updated = isolation_service.split_substems(session_id)
    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to split substems")
    return updated


@router.patch("/session/{session_id}/substem/{substem_id}", response_model=IsolationSession)
async def update_substem(
    session_id: str, substem_id: str, payload: UpdateSubstemRequest
) -> IsolationSession:
    _require_session(session_id)
    updates = payload.model_dump(exclude_none=True)
    if "eq_5band" in updates and updates["eq_5band"] is not None:
        updates["eq_5band"] = payload.eq_5band.model_dump() if payload.eq_5band else None
    if "eq_8band" in updates and updates["eq_8band"] is not None:
        updates["eq_8band"] = payload.eq_8band.model_dump() if payload.eq_8band else None
    updated = isolation_service.update_substem(session_id, substem_id, updates)
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id!r} or substem {substem_id!r} not found",
        )
    return updated


@router.post("/session/{session_id}/isolate-element", response_model=IsolationSession)
async def isolate_element(
    session_id: str, payload: IsolateElementRequest
) -> IsolationSession:
    _require_session(session_id)
    updated = isolation_service.isolate_element(
        session_id,
        element=payload.element,
        assign_to_eq=payload.assign_to_eq,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found")
    return updated


@router.post("/session/{session_id}/save-complete-bundle")
async def save_complete_bundle(
    session_id: str, payload: SaveCompleteBundleRequest
) -> dict:
    _require_session(session_id)
    return await isolation_service.save_complete_bundle(
        session_id,
        label=payload.label,
        save_isolated_sound=payload.save_isolated_sound,
        save_complete_loop=payload.save_complete_loop,
        save_six_stems=payload.save_six_stems,
        post_production=payload.post_production,
    )


@router.post("/session/{session_id}/preview")
async def preview(session_id: str) -> dict:
    _require_session(session_id)
    return isolation_service.preview(session_id)


@router.post("/session/{session_id}/export-loop")
async def export_loop(session_id: str) -> dict:
    _require_session(session_id)
    return isolation_service.export_loop(session_id)


@router.get("/session/{session_id}/audio/{target}")
async def get_session_audio(session_id: str, target: str) -> FileResponse:
    _require_session(session_id)
    try:
        audio_path = isolation_service.get_audio_path(session_id, target)
        audio_path = confined_file(settings.MUSIC_LIBRARY, audio_path, suffixes=AUDIO_SUFFIXES)
        return FileResponse(
            audio_path,
            media_type="audio/wav",
            headers={"Accept-Ranges": "bytes"},
        )
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
