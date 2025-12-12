"""
Quick demo server for Music Matters frontend
This provides mock endpoints so you can see the UI in action!
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import random

app = FastAPI(title="Music Matters Demo", version="2.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock data
MOCK_TRACKS = [
    {"id": "1", "artist": "Disclosure", "title": "White Noise", "year": 2013, "bpm": 128, "key": "Am", "camelot": "8A", "duration": 240},
    {"id": "2", "artist": "Flume", "title": "Never Be Like You", "year": 2016, "bpm": 132, "key": "C", "camelot": "8B", "duration": 228},
    {"id": "3", "artist": "ODESZA", "title": "Say My Name", "year": 2014, "bpm": 120, "key": "Gm", "camelot": "6A", "duration": 264},
    {"id": "4", "artist": "Porter Robinson", "title": "Shelter", "year": 2016, "bpm": 140, "key": "F#m", "camelot": "11A", "duration": 213},
    {"id": "5", "artist": "Madeon", "title": "Pop Culture", "year": 2011, "bpm": 128, "key": "Dm", "camelot": "7A", "duration": 208},
]

class SearchRequest(BaseModel):
    query: str
    sources: Optional[List[str]] = None

class GrabRequest(BaseModel):
    track_id: str
    artist: str
    title: str
    year: Optional[int] = None

@app.get("/api/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "version": "2.0.0-demo",
        "backend": "connected",
        "message": "🎧 Music Matters v2.0 - Demo Mode"
    }

@app.post("/api/search")
async def search(request: SearchRequest):
    """Mock search endpoint"""
    query_lower = request.query.lower()
    results = [t for t in MOCK_TRACKS if query_lower in t["artist"].lower() or query_lower in t["title"].lower()]
    
    if not results:
        results = random.sample(MOCK_TRACKS, min(3, len(MOCK_TRACKS)))
    
    return {
        "success": True,
        "tracks": results,
        "total": len(results),
        "query": request.query
    }

@app.post("/api/grab")
async def grab_track(request: GrabRequest):
    """Mock grab endpoint - simulate track processing"""
    return {
        "success": True,
        "job_id": f"job_{random.randint(1000, 9999)}",
        "message": f"Processing {request.artist} - {request.title}",
        "track": {
            "artist": request.artist,
            "title": request.title,
            "year": request.year,
        }
    }

@app.get("/api/grab/{job_id}")
async def get_job_status(job_id: str):
    """Mock job status endpoint"""
    stages = ["downloading", "analyzing", "separating", "extracting", "complete"]
    stage = random.choice(stages)
    progress = 0 if stage == "downloading" else (
        20 if stage == "analyzing" else (
            50 if stage == "separating" else (
                80 if stage == "extracting" else 100
            )
        )
    )
    
    return {
        "job_id": job_id,
        "status": "complete" if stage == "complete" else "processing",
        "stage": stage,
        "progress": progress,
        "message": f"{stage.capitalize()}..." if stage != "complete" else "Processing complete!",
        "track": {
            "artist": "Disclosure",
            "title": "White Noise",
            "bpm": 128,
            "key": "Am",
            "camelot": "8A",
            "duration": 240,
            "stems": ["drums", "bass", "vocals", "guitar", "piano", "other"],
            "sections": ["intro", "verse", "buildup", "drop", "breakdown", "outro"],
            "loops": [4, 8, 16, 32]
        } if stage == "complete" else None
    }

@app.get("/api/library")
async def get_library():
    """Mock library endpoint"""
    return {
        "success": True,
        "tracks": [
            {
                "id": "lib_1",
                "artist": "Disclosure",
                "title": "White Noise",
                "year": 2013,
                "bpm": 128,
                "key": "Am",
                "camelot": "8A",
                "processed": True,
                "stems_count": 6,
                "loops_count": 24
            }
        ],
        "total": 1
    }

@app.get("/api/analysis/sota/{track_id}")
async def get_sota_analysis(track_id: str):
    """Mock SOTA analysis endpoint"""
    return {
        "track_id": track_id,
        "structure": [
            {"section": "intro", "start": 0, "end": 16, "energy": 0.3},
            {"section": "verse", "start": 16, "end": 48, "energy": 0.5},
            {"section": "buildup", "start": 48, "end": 64, "energy": 0.7},
            {"section": "drop", "start": 64, "end": 96, "energy": 0.95},
            {"section": "breakdown", "start": 96, "end": 112, "energy": 0.4},
            {"section": "drop", "start": 112, "end": 144, "energy": 0.95},
            {"section": "outro", "start": 144, "end": 160, "energy": 0.2},
        ],
        "mashup_potential": 8.5,
        "sample_suggestions": [
            {"section": "drop", "start": 64, "end": 80, "score": 9.2},
            {"section": "verse", "start": 24, "end": 40, "score": 7.8}
        ]
    }

if __name__ == "__main__":
    import uvicorn
    print("🎧 Starting Music Matters Demo Server...")
    print("📍 Backend: http://localhost:8010")
    print("📖 API Docs: http://localhost:8010/docs")
    print("")
    uvicorn.run(app, host="0.0.0.0", port=8010)
