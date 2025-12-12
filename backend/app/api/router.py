"""
Music Matters - Main API Router
Combines all route modules into unified API
"""
from fastapi import APIRouter

from app.api.routes import (
    search,
    analysis,
    processing,
    export,
    fingerprint,
    library,
    jobs,
    status,
    ingest,
)

api_router = APIRouter()

# Include all route modules
api_router.include_router(search.router)
api_router.include_router(analysis.router)
api_router.include_router(processing.router)
api_router.include_router(export.router)
api_router.include_router(fingerprint.router)
api_router.include_router(library.router)
api_router.include_router(jobs.router)
api_router.include_router(status.router)
api_router.include_router(ingest.router)
