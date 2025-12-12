"""System status endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.api.schemas import AgentStatus
from app.config import settings
from app.services.registry import agent_registry

router = APIRouter()


@router.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "version": settings.version}


@router.get("/agents", response_model=list[AgentStatus])
async def agents() -> list[AgentStatus]:
    agents = agent_registry.list_agents()
    if not agents:
        raise HTTPException(status_code=503, detail="No agents registered")
    return agents
