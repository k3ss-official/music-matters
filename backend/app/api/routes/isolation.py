"""Isolation Workspace API routes."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.isolation_models import (
    CreateSessionRequest,
    IsolationSession,
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
    updated = isolation_service.update_substem(session_id, substem_id, updates)
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail=f"Session {session_id!r} or substem {substem_id!r} not found",
        )
    return updated


@router.post("/session/{session_id}/preview")
async def preview(session_id: str) -> dict:
    _require_session(session_id)
    return isolation_service.preview(session_id)


@router.post("/session/{session_id}/export-loop")
async def export_loop(session_id: str) -> dict:
    _require_session(session_id)
    return isolation_service.export_loop(session_id)
