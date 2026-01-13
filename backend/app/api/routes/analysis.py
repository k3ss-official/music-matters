"""
Music Matters - Audio Analysis Routes
SOTA structure analysis, BPM/key detection, harmonic mixing, beat tracking
"""
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
import yt_dlp
import librosa
import numpy as np

router = APIRouter(tags=["analysis"])

# Cache directory for downloads
CACHE_DIR = Path.home() / ".cache" / "music-matters"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


class AnalysisRequest(BaseModel):
    audio_path: str
    enable_sota: bool = True
    enable_fingerprint: bool = False


@router.post("/analyze")
async def analyze_track(request: AnalysisRequest):
    """Full audio analysis: BPM, key, structure, sections."""
    from app.services.analysis.audio_analyzer import get_audio_analyzer
    
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
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/track/{track_id}/analyze")
async def analyze_track_by_id(track_id: str, url: Optional[str] = None):
    """
    Download and analyze a track from YouTube.
    Returns: BPM, beats, downbeats, waveform data, duration.
    """
    try:
        # Download track
        output_path = CACHE_DIR / f"{track_id}.mp3"
        
        if not output_path.exists():
            download_url = url or f"https://www.youtube.com/watch?v={track_id}"
            ydl_opts = {
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
                'outtmpl': str(CACHE_DIR / f"{track_id}.%(ext)s"),
                'quiet': True,
                'no_warnings': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([download_url])
        
        # Load audio
        y, sr = librosa.load(str(output_path), sr=44100, mono=True)
        duration = librosa.get_duration(y=y, sr=sr)
        
        # Detect tempo and beats
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        beats = beat_times.tolist()
        
        # Downbeats (every 4 beats)
        downbeats = [beats[i] for i in range(0, len(beats), 4)]
        
        # Generate waveform
        waveform_samples = 1000
        hop_length = len(y) // waveform_samples
        waveform = []
        for i in range(0, len(y), hop_length):
            chunk = y[i:i+hop_length]
            if len(chunk) > 0:
                waveform.append(float(np.abs(chunk).mean()))
        
        if waveform:
            max_val = max(waveform)
            if max_val > 0:
                waveform = [v / max_val for v in waveform]
        
        return {
            'bpm': round(bpm, 1),
            'beats': beats,
            'downbeats': downbeats,
            'waveformData': waveform[:waveform_samples],
            'duration': round(duration, 2),
            'audioUrl': f"/api/audio/{track_id}",
            'key': None,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audio/{track_id}")
async def get_audio_file(track_id: str):
    """Serve audio file for playback."""
    from fastapi.responses import FileResponse
    
    audio_path = CACHE_DIR / f"{track_id}.mp3"
    
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        filename=f"{track_id}.mp3"
    )


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
