"""
Music Matters - Audio Analysis Routes
SOTA structure analysis, BPM/key detection, harmonic mixing
"""
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

router = APIRouter(prefix="/analysis", tags=["analysis"])


class AnalysisRequest(BaseModel):
    audio_path: str
    enable_sota: bool = True
    enable_fingerprint: bool = False


@router.post("/analyze")
async def analyze_track(request: AnalysisRequest):
    """Full audio analysis: BPM, key, structure, sections."""
    from app.services.analysis.audio_analyzer import get_audio_analyzer
    from app.services.analysis.sota_analyzer import get_sota_analyzer
    
    try:
        audio_path = Path(request.audio_path)
        if not audio_path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        # Basic analysis
        analyzer = get_audio_analyzer()
        basic_analysis = analyzer.analyze(str(audio_path))
        
        result = {
            "bpm": basic_analysis["bpm"],
            "key": basic_analysis["key"],
            "duration": basic_analysis["duration"],
            "sample_rate": basic_analysis["sample_rate"],
        }
        
        # SOTA analysis if enabled
        if request.enable_sota:
            sota = get_sota_analyzer()
            structure = sota.analyze_structure(str(audio_path))
            result["structure"] = structure
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/camelot/{key}")
async def get_compatible_keys(key: str):
    """Get harmonically compatible keys for mixing."""
    from app.config import get_compatible_keys as get_keys
    
    try:
        compatible = get_keys(key)
        return {
            "key": key,
            "compatible_keys": compatible
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/mashup-score")
async def calculate_mashup_score(track1_path: str, track2_path: str):
    """Calculate mashup compatibility between two tracks."""
    from app.services.analysis.harmonic_mixer import get_harmonic_mixer
    
    try:
        mixer = get_harmonic_mixer()
        score = mixer.calculate_mashup_score(track1_path, track2_path)
        return score
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
