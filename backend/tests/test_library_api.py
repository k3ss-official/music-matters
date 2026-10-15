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


def test_unified_online_search_and_library_path_config(tmp_path) -> None:
    from datetime import datetime, timezone
    from uuid import uuid4
    from app.config import settings, set_music_library
    from app.services.pipeline import TrackRecord, pipeline

    original_lib = settings.MUSIC_LIBRARY

    try:
        # 1. System config & library-path endpoints
        cfg_resp = client.get("/api/system/config")
        assert cfg_resp.status_code == 200
        cfg_data = cfg_resp.json()
        assert "music_library" in cfg_data
        assert "downloads_dir" in cfg_data

        custom_lib = tmp_path / "custom-music-folder"
        update_resp = client.post(
            "/api/system/library-path",
            json={"path": str(custom_lib)},
        )
        assert update_resp.status_code == 200
        updated_data = update_resp.json()
        assert updated_data["updated"] is True
        assert updated_data["music_library"] == str(custom_lib.resolve())
        assert (custom_lib / "downloads").is_dir()
        assert (custom_lib / "stems").is_dir()

        # Reject forbidden root path
        bad_resp = client.post("/api/system/library-path", json={"path": "/"})
        assert bad_resp.status_code == 400

        # 2. Online search endpoint with local library fallback & hints (lyrics/explain)
        tid = uuid4()
        pipeline._tracks[tid] = TrackRecord(
            track_id=tid,
            slug="garage-love-test",
            title="Feel The Garage Love",
            artist="DJ Test",
            status="stems_ready",
            created_at=datetime.now(timezone.utc),
            bpm=132.0,
            musical_key="8A",
            metadata={"tags": ["vocal", "garage"]},
        )

        online_resp = client.post(
            "/api/search/online",
            json={
                "query": "Feel The Garage",
                "hints": "vocal garage",
                "source": "library",
                "limit": 5,
            },
        )
        assert online_resp.status_code == 200
        online_data = online_resp.json()
        assert online_data["count"] >= 1
        assert any(t["title"] == "Feel The Garage Love" for t in online_data["tracks"])
        assert isinstance(online_data.get("narrative"), list)

        # 3. URL resolution endpoint handles arbitrary URLs gracefully without 500
        resolve_resp = client.post(
            "/api/search/resolve-url",
            json={"url": "https://soundcloud.com/example-artist/example-track"},
        )
        assert resolve_resp.status_code == 200
        res_data = resolve_resp.json()
        assert res_data["platform"] == "soundcloud"
        assert res_data["title"]

        del pipeline._tracks[tid]
    finally:
        set_music_library(original_lib)

