"""ACE-Step music generation endpoint."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.config import settings
from app.security import AUDIO_SUFFIXES, confined_file

router = APIRouter(prefix="/generate", tags=["generate"])

# Singleton — model is large; load once and reuse across requests
_pipeline = None


def _get_pipeline():
    global _pipeline
    if _pipeline is None:
        from acestep.pipeline_ace_step import ACEStepPipeline

        _pipeline = ACEStepPipeline.from_pretrained("ACE-Step/ACE-Step-v1.5-3.5B")
    return _pipeline


class GenerateRequest(BaseModel):
    prompt: str = Field(..., description="Text description of the music to generate")
    duration: float = Field(default=30.0, ge=5.0, le=180.0, description="Duration in seconds")
    bpm: float | None = Field(default=None, description="Optional BPM hint appended to prompt")
    key: str | None = Field(default=None, description="Optional key hint appended to prompt")
    guidance_scale: float = Field(default=15.0, ge=1.0, le=30.0)
    infer_steps: int = Field(default=60, ge=10, le=200)


@router.post("/ace-step")
async def generate_ace_step(payload: GenerateRequest) -> FileResponse:
    """Generate music from a text prompt using ACE-Step 1.5 (local, MIT licensed)."""
    # Build enriched prompt from optional hints
    prompt = payload.prompt
    if payload.bpm:
        prompt = f"{prompt}, {int(payload.bpm)}bpm"
    if payload.key:
        prompt = f"{prompt}, {payload.key}"

    out_dir = settings.MUSIC_LIBRARY / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"generation_{uuid.uuid4().hex[:8]}.wav"

    try:
        pipe = _get_pipeline()
        pipe(
            prompt=prompt,
            audio_duration=payload.duration,
            guidance_scale=payload.guidance_scale,
            infer_step=payload.infer_steps,
            save_path=str(out_path),
        )
    except Exception as exc:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Generation failed: {str(exc)}: {traceback.format_exc()}",
        )

    safe_out = confined_file(settings.MUSIC_LIBRARY, out_path, suffixes=AUDIO_SUFFIXES)
    return FileResponse(safe_out, media_type="audio/wav", filename=safe_out.name)
