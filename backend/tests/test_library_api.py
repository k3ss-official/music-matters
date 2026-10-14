"""API contract tests that do not run Demucs or yt-dlp."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_list_tracks() -> None:
    response = client.get("/api/library/tracks")
    assert response.status_code == 200
    payload = response.json()
    assert "items" in payload
    assert "total" in payload


def test_ingest_alias_rejects_missing_source() -> None:
    response = client.post("/api/ingest", json={})
    assert response.status_code in {400, 422}


def test_reslice_loops_search_and_delete_track() -> None:
    from datetime import datetime, timezone
    from uuid import uuid4
    import numpy as np
    import soundfile as sf
    from app.config import settings
    from app.services.pipeline import TrackRecord, pipeline

    sr = 22050
    t = np.linspace(0, 4.0, sr * 4, endpoint=False)
    audio = (0.35 * np.sin(2 * np.pi * 110 * t)).astype("float32")

    tid = uuid4()
    slug = f"reslice-{tid.hex[:6]}"
    dl_dir = settings.resolved_downloads_dir
    dl_dir.mkdir(parents=True, exist_ok=True)
    orig_path = dl_dir / f"{tid}.wav"
    sf.write(str(orig_path), audio, sr)

    proj_dir = settings.resolved_projects_dir / slug
    proj_dir.mkdir(parents=True, exist_ok=True)
    (proj_dir / "session.json").write_text("{}")

    rec = TrackRecord(
        track_id=tid,
        slug=slug,
        title="Reslice Test Song",
        artist="Reslice Artist",
        status="stems_ready",
        created_at=datetime.now(timezone.utc),
        bpm=120.0,
        musical_key="Am",
        original_path=orig_path,
        metadata={"duration": 4.0},
    )
    pipeline._tracks[tid] = rec

    # Search endpoints
    artists_resp = client.get("/api/search/artists", params={"q": "Reslice"})
    assert artists_resp.status_code == 200
    assert artists_resp.json()["count"] >= 1

    tracks_resp = client.get("/api/search/tracks", params={"q": "Reslice Test"})
    assert tracks_resp.status_code == 200
    assert any(item["track_id"] == str(tid) for item in tracks_resp.json()["tracks"])

    # Reslice loops
    reslice_resp = client.post(
        f"/api/library/tracks/{tid}/loops/reslice",
        json={"bar_length": 4},
    )
    assert reslice_resp.status_code == 200, reslice_resp.text
    loops = reslice_resp.json()
    assert len(loops) >= 1
    assert loops[0]["energy"] is not None

    # Delete track cleans up original download, loops_dir, projects_dir, and track record
    del_resp = client.delete(f"/api/library/tracks/{tid}")
    assert del_resp.status_code == 204
    assert not orig_path.exists()
    assert not proj_dir.exists()
    assert client.get(f"/api/library/tracks/{tid}").status_code == 404
