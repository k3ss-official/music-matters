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
    audio,
)
from app.api.routes import midi
from app.api.routes import generate
from app.api.routes import stream
from app.api.routes import system

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
api_router.include_router(audio.router)
api_router.include_router(midi.router)
api_router.include_router(generate.router)
api_router.include_router(stream.router)
api_router.include_router(system.router)
