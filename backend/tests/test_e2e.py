"""
End-to-end smoke tests for Music Matters backend.

Run with a live server:
    uvicorn app.main:app --port 8010 &
    pytest tests/test_e2e.py -v

Or against a custom host:
    MM_BASE_URL=http://localhost:8010/api pytest tests/test_e2e.py -v
"""

import os
import time
import zipfile
from io import BytesIO

import httpx
import pytest

BASE_URL = os.getenv("MM_BASE_URL", "http://localhost:8010/api")
TIMEOUT = 300  # seconds to wait for pipeline completion
POLL_INTERVAL = 3

client = httpx.Client(base_url=BASE_URL, timeout=60.0)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def poll_job(job_id: str, timeout: int = TIMEOUT) -> dict:
    """Poll /jobs/{job_id} until completed or failed, or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/jobs/{job_id}")
        assert r.status_code == 200, f"Job poll failed: {r.text}"
        data = r.json()
        status = data.get("status")
        if status in ("completed", "failed"):
            return data
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"Job {job_id} did not complete within {timeout}s")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestIngest:
    def test_text_query_ingest(self):
        """Ingest a text query → job queued successfully."""
        payload = {
            "source": "ytsearch1: drums loop 90bpm",
            "tags": ["e2e-test"],
            "collection": "e2e",
            "options": {
                "analysis": True,
                "separation": False,   # skip Demucs in CI
                "loop_slicing": True,
                "mastering": False,
            },
        }
        r = client.post("/ingest/ingest", json=payload)
        assert r.status_code == 202, f"Expected 202, got {r.status_code}: {r.text}"
        data = r.json()
        assert "job_id" in data
        assert "track_id" in data
        self.__class__._job_id = data["job_id"]
        self.__class__._track_id = data["track_id"]

    def test_job_completes(self):
        """Job created in previous test should reach completed state."""
        job_id = self.__class__._job_id
        result = poll_job(job_id)
        assert result["status"] == "completed", (
            f"Job ended with status={result['status']}, detail={result.get('detail')}"
        )

    def test_track_in_library(self):
        """Track should appear in the library after ingest."""
        track_id = self.__class__._track_id
        r = client.get(f"/library/tracks/{track_id}")
        assert r.status_code == 200, f"Track not found: {r.text}"
        data = r.json()
        assert data["track_id"] == track_id
        assert data["status"] in ("project_ready", "loops_ready", "analysed", "ingested")


class TestSmartPhrases:
    def test_phrases_endpoint(self):
        """GET /library/tracks/{id}/phrases returns phrase list."""
        # Use track from ingest test if available
        track_id = getattr(TestIngest, "_track_id", None)
        if not track_id:
            pytest.skip("No track available from ingest test")

        r = client.get(f"/library/tracks/{track_id}/phrases")
        # 200 with phrases or 404 if audio not found yet — both are acceptable
        # (separation may be skipped in CI)
        assert r.status_code in (200, 404), f"Unexpected status: {r.status_code} {r.text}"
        if r.status_code == 200:
            data = r.json()
            assert "phrases" in data
            assert isinstance(data["phrases"], list)
            assert "bpm" in data


class TestCustomLoop:
    def test_save_custom_loop(self):
        """POST /library/tracks/{id}/loops/custom → 200 with LoopPreview."""
        track_id = getattr(TestIngest, "_track_id", None)
        if not track_id:
            pytest.skip("No track available from ingest test")

        payload = {
            "start_time": 0.0,
            "end_time": 8.0,
            "stems": [],
        }
        r = client.post(f"/library/tracks/{track_id}/loops/custom", json=payload)
        assert r.status_code == 200, f"Custom loop failed: {r.status_code} {r.text}"
        data = r.json()
        assert "id" in data
        assert "label" in data
        assert data["bpm"] > 0
        self.__class__._loop_id = data["id"]

    def test_loop_audio_served(self):
        """Loop audio file should be accessible via /audio."""
        track_id = getattr(TestIngest, "_track_id", None)
        loop_id = getattr(self.__class__, "_loop_id", None)
        if not track_id or not loop_id:
            pytest.skip("No loop available")

        r = client.get(f"/library/tracks/{track_id}/loops/{loop_id}/audio")
        assert r.status_code == 200, f"Audio not served: {r.status_code} {r.text}"
        assert r.headers.get("content-type", "").startswith("audio/")


class TestAbletonExport:
    def test_ableton_export_returns_zip(self):
        """POST /export/ableton → valid ZIP containing .als project."""
        track_id = getattr(TestIngest, "_track_id", None)
        if not track_id:
            pytest.skip("No track available from ingest test")

        # Check what stems the track has
        r = client.get(f"/library/tracks/{track_id}")
        assert r.status_code == 200
        track_data = r.json()
        stems = track_data.get("stems") or ["mixdown"]
        # Strip .wav extensions if present
        stems = [s.replace(".wav", "") for s in stems]

        payload = {
            "track_id": track_id,
            "stems": stems[:4],  # max 4 for speed
            "start_time": 0.0,
            "end_time": 0.0,
        }
        r = client.post("/export/ableton", json=payload, timeout=60.0)
        assert r.status_code == 200, f"Ableton export failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["success"] is True
        assert "output_file" in data
        assert data["output_file"].endswith(".als")

    def test_ableton_file_is_valid_zip(self):
        """The .als output should be a valid ZIP (Ableton format)."""
        track_id = getattr(TestIngest, "_track_id", None)
        if not track_id:
            pytest.skip("No track available")

        r = client.get(f"/library/tracks/{track_id}")
        track_data = r.json()
        stems = (track_data.get("stems") or ["mixdown"])[:2]
        stems = [s.replace(".wav", "") for s in stems]

        export_r = client.post("/export/ableton", json={
            "track_id": track_id,
            "stems": stems,
            "start_time": 0.0,
            "end_time": 0.0,
        }, timeout=60.0)
        assert export_r.status_code == 200
        output_path = export_r.json()["output_file"]

        # Verify file exists and is a valid ZIP
        import os
        assert os.path.exists(output_path), f"Output file not found: {output_path}"
        assert zipfile.is_zipfile(output_path), f"Output is not a valid ZIP: {output_path}"
        with zipfile.ZipFile(output_path) as zf:
            names = zf.namelist()
            assert any("project.xml" in n for n in names), (
                f"No project.xml in ZIP. Contents: {names}"
            )


class TestBatchIngest:
    def test_batch_ingest(self):
        """POST /ingest/batch → multiple jobs queued."""
        payload = {
            "queries": [
                "ytsearch1: hip hop loop 85bpm",
                "ytsearch1: house bass loop",
            ],
            "options": {
                "analysis": True,
                "separation": False,
                "loop_slicing": False,
                "mastering": False,
            },
        }
        r = client.post("/ingest/batch", json=payload)
        assert r.status_code == 202, f"Batch ingest failed: {r.status_code} {r.text}"
        data = r.json()
        assert "jobs" in data
        assert len(data["jobs"]) == 2
        for job in data["jobs"]:
            assert "job_id" in job
            assert "track_id" in job


class TestMidiMapping:
    def test_apc_mini_mapping(self):
        """GET /midi/apc-mini-mk2/mapping → 64 note mappings."""
        r = client.get("/midi/apc-mini-mk2/mapping")
        assert r.status_code == 200, f"MIDI mapping failed: {r.status_code} {r.text}"
        data = r.json()
        assert "mappings" in data
        assert len(data["mappings"]) == 64
        first = data["mappings"][0]
        assert "note" in first
        assert "row" in first
        assert "col" in first
        assert "function" in first
        assert "color_idle" in first
        assert "color_active" in first


class TestLibraryFiltering:
    def test_track_list_pagination(self):
        """GET /library/tracks supports limit/offset."""
        r = client.get("/library/tracks", params={"limit": 5, "offset": 0})
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert len(data["items"]) <= 5

    def test_track_search(self):
        """POST /library/search returns results."""
        r = client.post("/library/search", json={"query": "loop"})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
