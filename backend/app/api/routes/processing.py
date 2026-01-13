"""
Music Matters - Audio Processing Routes
Stem separation, sample extraction, loop generation
"""
from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import uuid

router = APIRouter(tags=["processing"])

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
    file_path: str  # Frontend uses file_path
    artist: Optional[str] = "Unknown"
    title: Optional[str] = "Unknown"
    bar_count: int = 16
    section_preference: Optional[str] = None
    extract_stems: bool = False
    selected_stems: Optional[List[str]] = None
    max_samples: int = 3


@router.post("/samples/extract")
async def extract_samples_v2(request: SampleExtractionRequest):
    """Bridge for frontend extractSamples call."""
    from app.services.processing.sample_extractor import get_sample_extractor
    
    try:
        extractor = get_sample_extractor()
        # Mocking multi-sample result for UI
        sample_path = extractor.extract_smart_sample(
            audio_path=request.file_path,
            bars=request.bar_count,
            section_preference=request.section_preference
        )
        
        return {
            "success": True,
            "samples": [
                {
                    "id": "sample-1",
                    "path": str(sample_path),
                    "bars": request.bar_count,
                    "label": "Intelligent SOTA Extraction"
                }
            ],
            "track_id": str(uuid.uuid4())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/samples")
async def list_samples():
    """List available samples."""
    return {"samples": []}


@router.get("/stems/info")
async def get_stem_info():
    """Get info about available stems."""
    return {
        "model": "htdemucs_6s",
        "stems": ["drums", "bass", "vocals", "guitar", "piano", "other"]
    }


@router.post("/stems/separate")
async def separate_stems_alias(request: dict):
    """Bridge for frontend separateStems call."""
    from app.services.processing.stem_separator import get_stem_separator
    
    file_path = request.get("file_path")
    if not file_path:
         raise HTTPException(status_code=400, detail="file_path required")
         
    try:
        separator = get_stem_separator()
        result = separator.separate(Path(file_path))
        return {
            "success": True,
            "output_dir": str(result.output_dir),
            "stems": {name: str(path) for name, path in result.stems.items()}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/processing/process")
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
