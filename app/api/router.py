"""Composite API router."""

from fastapi import APIRouter

from app.api.routes import ingest, jobs, library, status

api_router = APIRouter()
api_router.include_router(status.router, tags=["system"])
api_router.include_router(ingest.router, prefix="/jobs", tags=["ingest"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(library.router, prefix="/library", tags=["library"])

__all__ = ["api_router"]
