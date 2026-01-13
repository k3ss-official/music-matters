from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
from pathlib import Path
import os
import subprocess
import librosa
import soundfile as sf
import numpy as np

router = APIRouter(prefix="/loop", tags=["loop"])

# Paths
CACHE_DIR = Path.home() / ".cache" / "music-matters"
OUTPUT_DIR = Path.home() / "Sound_Bank"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class LoopExtractionRequest(BaseModel):
    track_id: str
    start_time: float  # seconds
    end_time: float  # seconds
    export_stems: bool = False
    stem_levels: Optional[Dict[str, float]] = None  # {"drums": 100, "bass": 80, ...}
    daw_target: Optional[str] = None  # "fl_studio", "ableton", "logic", "maschine"


class LoopExtractionResponse(BaseModel):
    success: bool
    files: list[str]
    output_dir: str
    message: str


def extract_audio_slice(audio_path: Path, start_time: float, end_time: float, output_path: Path):
    """Extract a slice of audio using librosa."""
    y, sr = librosa.load(str(audio_path), sr=44100, mono=False)
    
    # Convert time to samples
    start_sample = int(start_time * sr)
    end_sample = int(end_time * sr)
    
    # Extract slice
    if len(y.shape) == 1:
        # Mono
        y_slice = y[start_sample:end_sample]
    else:
        # Stereo
        y_slice = y[:, start_sample:end_sample]
    
    # Save
    sf.write(str(output_path), y_slice.T if len(y.shape) > 1 else y_slice, sr)
    return output_path


def separate_stems_demucs(audio_path: Path, output_dir: Path) -> Dict[str, Path]:
    """
    Separate audio into 6 stems using Demucs.
    Returns dict of stem names to file paths.
    """
    try:
        # Run Demucs
        cmd = [
            "demucs",
            "--two-stems=vocals",  # Fast mode for MVP
            "-n", "htdemucs_6s",
            "-o", str(output_dir),
            str(audio_path)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            raise Exception(f"Demucs failed: {result.stderr}")
        
        # Find output stems
        track_name = audio_path.stem
        stems_dir = output_dir / "htdemucs_6s" / track_name
        
        stems = {}
        for stem_name in ["drums", "bass", "vocals", "guitar", "piano", "other"]:
            stem_path = stems_dir / f"{stem_name}.wav"
            if stem_path.exists():
                stems[stem_name] = stem_path
        
        return stems
        
    except subprocess.TimeoutExpired:
        raise Exception("Stem separation timed out (>5 minutes)")
    except Exception as e:
        raise Exception(f"Stem separation failed: {e}")


def apply_stem_levels(stem_paths: Dict[str, Path], levels: Dict[str, float], output_dir: Path) -> Dict[str, Path]:
    """
    Apply volume adjustments to stems.
    levels: {"drums": 100, "bass": 80, ...} (0-100)
    """
    adjusted_stems = {}
    
    for stem_name, stem_path in stem_paths.items():
        level = levels.get(stem_name, 100) / 100.0  # Convert to 0-1
        
        # Load stem
        y, sr = librosa.load(str(stem_path), sr=44100, mono=False)
        
        # Apply volume
        y_adjusted = y * level
        
        # Save adjusted stem
        output_path = output_dir / f"{stem_name}_adjusted.wav"
        sf.write(str(output_path), y_adjusted.T if len(y.shape) > 1 else y_adjusted, sr)
        adjusted_stems[stem_name] = output_path
    
    return adjusted_stems


@router.post("/extract", response_model=LoopExtractionResponse)
async def extract_loop(request: LoopExtractionRequest):
    """
    Extract a loop from a track with optional stem separation and DAW export.
    
    Steps:
    1. Load audio file from cache
    2. Extract loop region (start_time to end_time)
    3. If export_stems=True:
       - Separate into 6 stems using Demucs
       - Apply stem_levels (volume adjustments)
    4. Save to ~/Sound_Bank/
    """
    try:
        # Find audio file
        audio_path = CACHE_DIR / f"{request.track_id}.mp3"
        if not audio_path.exists():
            raise HTTPException(status_code=404, detail="Track not found in cache")
        
        # Create output directory for this loop
        loop_dir = OUTPUT_DIR / f"loop_{request.track_id}_{int(request.start_time)}"
        loop_dir.mkdir(parents=True, exist_ok=True)
        
        files = []
        
        if request.export_stems:
            # Extract full loop first
            temp_loop = loop_dir / "temp_loop.wav"
            extract_audio_slice(audio_path, request.start_time, request.end_time, temp_loop)
            
            # Separate stems
            stems = separate_stems_demucs(temp_loop, loop_dir)
            
            # Apply stem levels if specified
            if request.stem_levels:
                stems = apply_stem_levels(stems, request.stem_levels, loop_dir)
            
            # Move stems to final location
            for stem_name, stem_path in stems.items():
                final_path = loop_dir / f"{stem_name}.wav"
                stem_path.rename(final_path)
                files.append(str(final_path))
            
            # Clean up temp file
            if temp_loop.exists():
                temp_loop.unlink()
        else:
            # Just extract the loop (no stems)
            loop_path = loop_dir / "loop.wav"
            extract_audio_slice(audio_path, request.start_time, request.end_time, loop_path)
            files.append(str(loop_path))
        
        return LoopExtractionResponse(
            success=True,
            files=files,
            output_dir=str(loop_dir),
            message=f"Loop extracted successfully ({len(files)} files)"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/candidates/{track_id}")
async def get_loop_candidates(track_id: str, length: int = 16):
    """
    Get suggested loop positions based on structure analysis.
    
    For MVP: Returns evenly spaced candidates.
    TODO: Implement SOTA structure analysis for intelligent suggestions.
    """
    try:
        # Load audio to get duration and beats
        audio_path = CACHE_DIR / f"{track_id}.mp3"
        if not audio_path.exists():
            raise HTTPException(status_code=404, detail="Track not found")
        
        y, sr = librosa.load(str(audio_path), sr=44100, mono=True)
        duration = librosa.get_duration(y=y, sr=sr)
        
        # Detect beats
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        
        # Generate candidates (evenly spaced for MVP)
        candidates = []
        loop_duration = (length / (tempo / 60))  # length in beats to seconds
        
        # Start at 25% through the track, space candidates evenly
        start_offset = duration * 0.25
        num_candidates = 5
        spacing = (duration - start_offset - loop_duration) / (num_candidates - 1)
        
        labels = ["Drop", "Chorus", "Breakdown", "Build-up", "Outro"]
        
        for i in range(num_candidates):
            start_time = start_offset + (i * spacing)
            end_time = start_time + loop_duration
            
            # Find closest beats
            start_beat = np.argmin(np.abs(beat_times - start_time))
            end_beat = np.argmin(np.abs(beat_times - end_time))
            
            candidates.append({
                "start_time": float(beat_times[start_beat]),
                "end_time": float(beat_times[end_beat]),
                "start_beat": int(start_beat),
                "end_beat": int(end_beat),
                "length": length,
                "confidence": 0.9 - (i * 0.1),  # Mock confidence
                "label": labels[i],
            })
        
        return {"track_id": track_id, "candidates": candidates}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
