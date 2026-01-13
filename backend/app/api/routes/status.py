"""System status endpoints."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException

from app.api.schemas import AgentStatus
from app.config import settings
from app.services.registry import agent_registry

router = APIRouter()


@router.get("/health", tags=["system"])
async def health() -> dict[str, Any]:
    return {
        "status": "ok", 
        "version": settings.APP_VERSION,
        "services": {
            "metadata": True,
            "processing": True,
            "storage": True
        }
    }


@router.get("/info", tags=["system"])
async def info() -> dict[str, Any]:
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "debug": settings.DEBUG
    }


@router.get("/agents", response_model=list[AgentStatus])
async def agents() -> list[AgentStatus]:
    agents = agent_registry.list_agents()
    if not agents:
        return [] # Return empty list if no agents
    return agents
