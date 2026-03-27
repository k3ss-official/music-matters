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
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.api.router import api_router

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Local-first DJ & producer automation platform with SOTA features",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# CORS middleware for frontend
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

# Include API router
app.include_router(api_router, prefix="/api")

# Download any generated file (exports, .als, loops) — path must stay inside MUSIC_LIBRARY
@app.get("/api/download-file")
async def download_file(path: str):
    """Serve a generated export file (e.g. .als, .wav loop) by absolute path."""
    from pathlib import Path
    from fastapi import HTTPException
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    # Security: path must be inside the music library root
    try:
        file_path.resolve().relative_to(settings.MUSIC_LIBRARY.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    import mimetypes
    media_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return FileResponse(file_path, media_type=media_type, filename=file_path.name)


# Serve audio files
@app.get("/audio/{path:path}")
async def serve_audio(path: str):
    """Serve audio files from the music library."""
    file_path = settings.MUSIC_LIBRARY / path
    
    if not file_path.exists():
        return {"error": "File not found"}, 404
    
    # Security: ensure path is within library
    try:
        file_path.resolve().relative_to(settings.MUSIC_LIBRARY.resolve())
    except ValueError:
        return {"error": "Access denied"}, 403
    
    return FileResponse(
        file_path,
        media_type="audio/wav" if file_path.suffix == ".wav" else "audio/mpeg"
    )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "name": settings.APP_NAME,
        "library_path": str(settings.MUSIC_LIBRARY),
        "features": {
            "search": True,
            "sota_analysis": settings.ENABLE_SOTA_ANALYSIS,
            "fingerprinting": settings.ENABLE_FINGERPRINTING,
            "demucs": True,
            "daw_export": True,
            "harmonic_mixing": True,
        }
    }


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    # Redirect HuggingFace model cache to SSD before any model imports
    hf_home = str(settings.HF_HOME)
    os.environ.setdefault("HF_HOME", hf_home)
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", hf_home + "/hub")
    os.environ.setdefault("TRANSFORMERS_CACHE", hf_home + "/hub")

    logger.info(f"🎧 {settings.APP_NAME} v{settings.APP_VERSION} starting...")
    logger.info(f"📁 Music Library: {settings.MUSIC_LIBRARY}")
    logger.info(f"🤗 HF cache: {hf_home}")
    logger.info(f"🎛️  Demucs Model: {settings.DEMUCS_MODEL} on {settings.DEMUCS_DEVICE}")
    logger.info(f"🔬 SOTA Analysis: {settings.ENABLE_SOTA_ANALYSIS}")
    logger.info(f"👆 Fingerprinting: {settings.ENABLE_FINGERPRINTING}")
    logger.info("✅ Music Matters ready!")


@app.on_event("shutdown")
async def shutdown_event():
    """Graceful shutdown: finish current stage, block new ones, cancel queued tasks."""
    logger.info("👋 Music Matters shutting down gracefully...")
    from app.services.pipeline import pipeline

    pipeline._shutting_down = True
    # Cancel tasks that are queued (haven't acquired the semaphore yet)
    for job in pipeline._jobs.values():
        if job.task and not job.task.done() and job.status == "queued":
            job.task.cancel()
    logger.info("✅ Shutdown flag set — running jobs will finish current stage then stop")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        log_level="debug" if settings.DEBUG else "info"
    )
