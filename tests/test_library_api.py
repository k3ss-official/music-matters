import time
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from app.main import create_app


client = TestClient(create_app())


def _create_test_audio(path: Path, duration_seconds: float = 4.0, frequency: float = 440.0) -> None:
    sample_rate = 44100
    samples = np.linspace(0, duration_seconds, int(sample_rate * duration_seconds), endpoint=False)
    tone = 0.2 * np.sin(2 * np.pi * frequency * samples)
    sf.write(path, tone, sample_rate)


def _wait_for_completion(job_id: str, timeout: float = 30.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"/api/v1/jobs/{job_id}")
        response.raise_for_status()
        job = response.json()
        if job["status"] in {"completed", "failed"}:
            return job
        time.sleep(0.25)
    raise AssertionError("Pipeline did not finish within timeout")


def test_ingest_pipeline_generates_loops(tmp_path: Path) -> None:
    audio_path = tmp_path / "test_tone.wav"
    _create_test_audio(audio_path)

    response = client.post(
        "/api/v1/jobs/ingest",
        json={"source": str(audio_path), "tags": ["unit-test"]},
    )
    assert response.status_code == 202
    payload = response.json()
    job_id = payload["job_id"]
    track_id = payload["track_id"]

    job = _wait_for_completion(job_id)
    assert job["status"] == "completed"
    assert job["track_id"] == track_id
    assert any(stage["status"] == "done" for stage in job["stages"])

    track_response = client.get(f"/api/v1/library/tracks/{track_id}")
    assert track_response.status_code == 200
    track = track_response.json()
    assert track["status"] == "project_ready"
    assert track["bpm"] > 0
    assert "mixdown.wav" in track["stems"]
    assert len(track["stems"]) >= 1

    search_response = client.post("/api/v1/library/search", json={"query": "test_tone"})
    assert search_response.status_code == 200
    results = search_response.json()
    assert any(result["track_id"] == track_id for result in results)

    loop_response = client.get(f"/api/v1/library/tracks/{track_id}/loops")
    assert loop_response.status_code == 200
    loops = loop_response.json()
    assert loops, "Expected at least one loop generated"
    loop = loops[0]
    assert loop["file_url"]

    audio_preview = client.get(loop["file_url"])
    assert audio_preview.status_code == 200
    assert audio_preview.headers["content-type"] == "audio/wav"

    reslice_response = client.post(
        f"/api/v1/library/tracks/{track_id}/loops/reslice",
        json={"bar_length": 8},
    )
    assert reslice_response.status_code == 200
    resliced = reslice_response.json()
    assert all(item["bar_count"] == 8 for item in resliced)
