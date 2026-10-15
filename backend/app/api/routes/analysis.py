"""
Music Matters - Audio Analysis Routes
SOTA structure analysis, BPM/key detection, harmonic mixing
"""
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.config import settings
from app.security import AUDIO_SUFFIXES, confined_file

router = APIRouter(prefix="/analysis", tags=["analysis"])


class AnalysisRequest(BaseModel):
    audio_path: str
    enable_sota: bool = True
    enable_fingerprint: bool = False


@router.post("/analyze")
async def analyze_track(request: AnalysisRequest):
    """Full audio analysis: BPM, key, structure, sections."""
    audio_path = confined_file(
        settings.MUSIC_LIBRARY, request.audio_path, suffixes=AUDIO_SUFFIXES
    )

    try:
        from app.services.analysis.audio_analyzer import get_audio_analyzer
        from app.services.analysis.sota_analyzer import get_sota_analyzer

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

    except HTTPException:
        raise
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
    path1 = confined_file(settings.MUSIC_LIBRARY, track1_path, suffixes=AUDIO_SUFFIXES)
    path2 = confined_file(settings.MUSIC_LIBRARY, track2_path, suffixes=AUDIO_SUFFIXES)

    try:
        from app.services.analysis.harmonic_mixer import get_harmonic_mixer

        mixer = get_harmonic_mixer()
        score = mixer.calculate_mashup_score(str(path1), str(path2))
        return score
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
