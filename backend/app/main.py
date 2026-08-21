"""
Music Matters - Unified FastAPI Application
The ultimate DJ & producer automation platform combining:
- Multi-source track search (MusicBrainz, Spotify, YouTube)
- SOTA audio structure analysis
- 6-stem separation (Demucs)
- Intelligent sampling & loop generation
- Harmonic mixing (Camelot wheel, mashup scoring)
- Audio fingerprinting & similarity detection
- DAW export (Rekordbox, Serato, M3U)
"""
import logging
import mimetypes
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import settings
from app.api.router import api_router
from app.security import AUDIO_SUFFIXES, EXPORT_SUFFIXES, confined_file

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup; finish in-flight stages on shutdown."""
    hf_home = str(settings.HF_HOME)
    os.environ.setdefault("HF_HOME", hf_home)
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", hf_home + "/hub")
    os.environ.setdefault("TRANSFORMERS_CACHE", hf_home + "/hub")

    logger.info("%s v%s starting...", settings.APP_NAME, settings.APP_VERSION)
    logger.info("Music Library: %s", settings.MUSIC_LIBRARY)
    logger.info("HF cache: %s", hf_home)
    logger.info("Demucs Model: %s on %s", settings.DEMUCS_MODEL, settings.DEMUCS_DEVICE)
    logger.info("SOTA Analysis: %s", settings.ENABLE_SOTA_ANALYSIS)
    logger.info("Fingerprinting: %s", settings.ENABLE_FINGERPRINTING)
    logger.info("Music Matters ready")
    yield

    logger.info("Music Matters shutting down gracefully...")
    from app.services.pipeline import pipeline

    pipeline._shutting_down = True
    for job in pipeline._jobs.values():
        if job.task and not job.task.done() and job.status == "queued":
            job.task.cancel()
    logger.info("Shutdown flag set — running jobs will finish current stage then stop")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Local-first DJ & producer automation platform with SOTA features",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "tauri://localhost",
        "https://tauri.localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/api/download-file")
async def download_file(path: str):
    """Serve a generated export file. Path must stay inside MUSIC_LIBRARY."""
    file_path = confined_file(settings.MUSIC_LIBRARY, path, suffixes=EXPORT_SUFFIXES)
    media_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return FileResponse(file_path, media_type=media_type, filename=file_path.name)


@app.get("/audio/{path:path}")
async def serve_audio(path: str):
    """Serve audio files from the music library."""
    file_path = confined_file(
        settings.MUSIC_LIBRARY,
        settings.MUSIC_LIBRARY / path,
        suffixes=AUDIO_SUFFIXES,
    )
    media = "audio/wav" if file_path.suffix.lower() == ".wav" else "audio/mpeg"
    return FileResponse(file_path, media_type=media)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "name": settings.APP_NAME,
        "features": {
            "search": True,
            "sota_analysis": settings.ENABLE_SOTA_ANALYSIS,
            "fingerprinting": settings.ENABLE_FINGERPRINTING,
            "demucs": True,
            "daw_export": True,
            "harmonic_mixing": True,
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        log_level="debug" if settings.DEBUG else "info"
    )
