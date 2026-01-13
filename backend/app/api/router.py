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
    loop,
)

api_router = APIRouter()

# Include all route modules with simplified or no prefixes to match frontend
api_router.include_router(search.router)      # /api/search/...
api_router.include_router(analysis.router)    # /api/analyze
api_router.include_router(processing.router)  # /api/samples, /api/stems
api_router.include_router(export.router, prefix="/export", tags=["export"])
api_router.include_router(fingerprint.router) # /api/fingerprint/...
api_router.include_router(library.router, prefix="/track", tags=["track"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(status.router)      # /api/health
api_router.include_router(ingest.router)      # /api/download, /api/upload
api_router.include_router(loop.router)        # /api/loop/...
