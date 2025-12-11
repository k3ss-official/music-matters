"""
Music Matters - Audio Processing Routes
Stem separation, sample extraction, loop generation
"""
from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import uuid

router = APIRouter(prefix="/processing", tags=["processing"])

# In-memory job tracking (upgrade to Redis/DB for production)
jobs = {}


class ProcessingRequest(BaseModel):
    audio_path: str
    artist: str
    title: str
    year: Optional[int] = None
    enable_stems: bool = True
    enable_sections: bool = True
    enable_loops: bool = True
    loop_bars: List[int] = [4, 8, 16, 32]


class SampleExtractionRequest(BaseModel):
    audio_path: str
    bars: int = 16
    section_preference: Optional[str] = None  # 'drop', 'chorus', 'breakdown', etc.


@router.post("/process")
async def process_track(request: ProcessingRequest, background_tasks: BackgroundTasks):
    """
    Full track processing pipeline:
    - Analyze (BPM, key, structure)
    - Separate stems (Demucs 6-stem)
    - Extract sections
    - Generate loops
    """
    job_id = str(uuid.uuid4())[:8]
    
    jobs[job_id] = {
        "id": job_id,
        "status": "queued",
        "progress": 0,
        "stage": "Initializing",
        "track": {
            "artist": request.artist,
            "title": request.title,
            "year": request.year
        },
        "result": None,
        "error": None
    }
    
    # Run processing in background
    background_tasks.add_task(
        _run_processing_pipeline,
        job_id,
        request
    )
    
    return {
        "job_id": job_id,
        "status": "queued",
        "message": f"Processing started for {request.artist} - {request.title}"
    }


async def _run_processing_pipeline(job_id: str, request: ProcessingRequest):
    """Background task for full processing pipeline."""
    from app.services.processing.audio_processor import get_audio_processor
    
    job = jobs[job_id]
    
    try:
        job["status"] = "running"
        job["stage"] = "Processing audio"
        job["progress"] = 10
        
        audio_path = Path(request.audio_path)
        if not audio_path.exists():
            job["status"] = "failed"
            job["error"] = "Audio file not found"
            return
        
        processor = get_audio_processor()
        
        # Full processing
        output = processor.process_track(
            audio_path=audio_path,
            artist=request.artist,
            title=request.title,
            year=request.year
        )
        
        job["progress"] = 100
        job["stage"] = "Complete"
        job["status"] = "completed"
        job["result"] = output.to_dict()
        
    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)


@router.get("/job/{job_id}")
async def get_job_status(job_id: str):
    """Get processing job status."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]


@router.post("/extract-sample")
async def extract_sample(request: SampleExtractionRequest):
    """Extract intelligent sample from track."""
    from app.services.processing.sample_extractor import get_sample_extractor
    
    try:
        extractor = get_sample_extractor()
        sample_path = extractor.extract_smart_sample(
            audio_path=request.audio_path,
            bars=request.bars,
            section_preference=request.section_preference
        )
        
        return {
            "success": True,
            "sample_path": str(sample_path),
            "bars": request.bars
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
