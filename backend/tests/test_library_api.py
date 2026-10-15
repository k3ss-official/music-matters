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


def test_clean_normalize_six_stems_and_multi_angle_discovery() -> None:
    from datetime import datetime, timezone
    from uuid import uuid4
    import numpy as np
    import soundfile as sf
    from app.config import settings
    from app.services.pipeline import TrackRecord, pipeline

    sr = 22050
    t = np.linspace(0, 8.0, sr * 8, endpoint=False)
    # Deliberately add +0.18 DC offset and low peak amplitude
    raw_street_audio = (0.18 + 0.22 * np.sin(2 * np.pi * 80 * t) + 0.15 * np.sin(2 * np.pi * 880 * t)).astype("float32")

    tid = uuid4()
    slug = f"street-{tid.hex[:6]}"
    dl_dir = settings.resolved_downloads_dir
    dl_dir.mkdir(parents=True, exist_ok=True)
    orig_path = dl_dir / f"{tid}.wav"
    sf.write(str(orig_path), raw_street_audio, sr)

    rec = TrackRecord(
        track_id=tid,
        slug=slug,
        title="Underground Street ID (VIP Remix)",
        artist="Producer X",
        status="ingested",
        created_at=datetime.now(timezone.utc),
        bpm=126.0,
        musical_key="Fm",
        original_path=orig_path,
        metadata={
            "duration": 8.0,
            "producer": "Producer X",
            "remixer": "VIP Remix",
            "year": 2024,
            "lyrics": "feel the underground beat tonight",
        },
    )
    pipeline._tracks[tid] = rec

    # 1. Clean, remove DC offset, and normalize via API
    clean_resp = client.post(f"/api/library/tracks/{tid}/clean")
    assert clean_resp.status_code == 200
    clean_data = clean_resp.json()
    assert clean_data["cleaned"] is True
    assert clean_data["dc_offset_removed"] > 0.1
    assert clean_data["normalized"] is True

    # Verify mean is now ~0 and peak is ~0.966 (-0.3 dBFS)
    cleaned_samples, _ = sf.read(str(orig_path))
    assert abs(float(np.mean(cleaned_samples))) < 0.01
    assert abs(float(np.max(np.abs(cleaned_samples))) - 0.966) < 0.03

    # 2. Save loop bundle (Complete Loop + 6 Stems generated automatically via 6-stem DSP fallback)
    bundle_resp = client.post(
        f"/api/library/tracks/{tid}/loops/save-bundle",
        json={
            "start_time": 0.0,
            "end_time": 2.0,
            "label": "Drop Hook",
            "include_all_stems": True,
            "post_production": True,
        },
    )
    assert bundle_resp.status_code == 200, bundle_resp.text
    b_json = bundle_resp.json()
    assert b_json["total_saved"] == 7  # 1 complete loop + 6 stem loops
    assert len(b_json["stem_loops"]) == 6
    stem_names = {s["stem"] for s in b_json["stem_loops"]}
    assert stem_names == {"drums", "bass", "vocals", "guitar", "piano", "other"}

    # 3. Multi-angle discovery search (producer + date range + lyrics + natural language)
    disc_resp = client.post(
        "/api/search/discover",
        json={
            "angle": "natural_language",
            "query": "Underground Street",
            "lyrics": "underground beat tonight",
            "description": "tech house groovy bassline",
            "producer": "Producer X",
            "remixer": "VIP Remix",
            "year_from": 2022,
            "year_to": 2026,
            "track_type": "remix",
        },
    )
    assert disc_resp.status_code == 200
    disc_data = disc_resp.json()
    assert disc_data["count"] >= 1
    assert any(m["track_id"] == str(tid) for m in disc_data["matches"])

    # Cleanup
    client.delete(f"/api/library/tracks/{tid}")

