"""Tests for the Isolation Workspace API."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_session(**kwargs) -> dict:
    payload = {
        "parent_stem_name": "vocals",
        "bpm": 128.0,
        "region_start": 0.0,
        "region_end": 8.0,
        **kwargs,
    }
    resp = client.post("/api/isolation/session", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_create_session():
    session = _create_session()
    assert "id" in session
    assert session["parent_stem_name"] == "vocals"
    assert session["bpm"] == 128.0
    assert session["substems"] == []
    assert session["audition_mode"] == "full_context"


def test_get_session():
    session = _create_session()
    resp = client.get(f"/api/isolation/session/{session['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == session["id"]


def test_get_session_404():
    resp = client.get("/api/isolation/session/does-not-exist")
    assert resp.status_code == 404


def test_update_session():
    session = _create_session()
    sid = session["id"]
    resp = client.patch(
        f"/api/isolation/session/{sid}",
        json={"audition_mode": "selected_only", "bpm": 130.0},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["audition_mode"] == "selected_only"
    assert data["bpm"] == 130.0


def test_split_substems_returns_five():
    session = _create_session()
    sid = session["id"]
    resp = client.post(f"/api/isolation/session/{sid}/split-substems")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["substems"]) == 5
    for sub in data["substems"]:
        assert sub["is_placeholder"] is True
        assert sub["implementation_status"] == "placeholder"
        assert len(sub["waveform_peaks"]) == 200
        assert "color" in sub


def test_update_substem():
    session = _create_session()
    sid = session["id"]
    # First split to get substems
    split = client.post(f"/api/isolation/session/{sid}/split-substems").json()
    sub_id = split["substems"][0]["id"]

    resp = client.patch(
        f"/api/isolation/session/{sid}/substem/{sub_id}",
        json={
            "selected": True,
            "gain_db": -3.5,
            "eq_5band": {"low_db": 2.0, "low_mid_db": 0.0, "mid_db": -1.0, "high_mid_db": 0.0, "high_db": 0.0},
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    updated_sub = next(s for s in data["substems"] if s["id"] == sub_id)
    assert updated_sub["selected"] is True
    assert updated_sub["gain_db"] == pytest.approx(-3.5)
    assert updated_sub["eq_5band"]["low_db"] == pytest.approx(2.0)


def test_update_substem_bad_id():
    session = _create_session()
    sid = session["id"]
    # No substems yet — should return 404
    resp = client.patch(
        f"/api/isolation/session/{sid}/substem/bad-id",
        json={"selected": True},
    )
    assert resp.status_code == 404


def test_extract_region():
    session = _create_session()
    sid = session["id"]
    resp = client.post(f"/api/isolation/session/{sid}/extract-region")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "placeholder"
    assert "region_start" in data


def test_export_loop():
    session = _create_session()
    sid = session["id"]
    client.post(f"/api/isolation/session/{sid}/split-substems")
    resp = client.post(f"/api/isolation/session/{sid}/export-loop")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "placeholder"
    assert "export_settings" in data
    assert "selected_substems" in data


def test_session_hydrates_from_track_and_exports_custom_format():
    from datetime import datetime, timezone
    from pathlib import Path
    from uuid import uuid4
    import numpy as np
    import soundfile as sf
    from app.config import settings
    from app.services.pipeline import TrackRecord, pipeline

    sr = 44100
    t = np.linspace(0, 2.0, sr * 2, endpoint=False)
    drums_audio = (0.45 * np.sin(2 * np.pi * 90 * t) + 0.25 * np.sin(2 * np.pi * 3500 * t)).astype("float32")
    bass_audio = (0.6 * np.sin(2 * np.pi * 60 * t)).astype("float32")

    tid = uuid4()
    stems_dir = settings.resolved_stems_dir / f"iso-{tid.hex[:8]}"
    stems_dir.mkdir(parents=True, exist_ok=True)
    sf.write(str(stems_dir / "drums.wav"), drums_audio, sr)
    sf.write(str(stems_dir / "bass.wav"), bass_audio, sr)

    record = TrackRecord(
        track_id=tid,
        slug=f"iso-{tid.hex[:8]}",
        title="Hydrated Track",
        artist="Test Artist",
        status="stems_ready",
        created_at=datetime.now(timezone.utc),
        bpm=125.0,
        musical_key="Am",
        original_path=stems_dir / "drums.wav",
        stems_dir=stems_dir,
        stems=["drums.wav", "bass.wav"],
    )
    pipeline._tracks[tid] = record

    # Create session passing source_track_id and region_end=0 (as UI does when no loop region set yet)
    resp = client.post(
        "/api/isolation/session",
        json={
            "source_track_id": str(tid),
            "parent_stem_name": "Hydrated Track",
            "region_start": 0.0,
            "region_end": 0.0,
        },
    )
    assert resp.status_code == 201, resp.text
    session = resp.json()
    sid = session["id"]
    assert session["source_track_id"] == str(tid)
    assert session["parent_stem_name"] == "drums"
    assert session["parent_stem_path"] == str(stems_dir / "drums.wav")
    assert set(session["available_stems"]) == {"drums", "bass"}
    assert len(session["parent_waveform_peaks"]) == 200
    assert session["region_end"] > 0.0

    # Switch parent stem to bass via PATCH
    patched = client.patch(
        f"/api/isolation/session/{sid}",
        json={
            "parent_stem_name": "bass",
            "export_settings": {
                "loop_length_seconds": 2.0,
                "bpm": 125.0,
                "grid_snap": "1_bar",
                "format": "flac",
                "sample_rate": 48000,
                "bit_depth": 16,
            },
        },
    )
    assert patched.status_code == 200
    assert patched.json()["parent_stem_path"] == str(stems_dir / "bass.wav")

    # Split substems — must extract real region and produce non-placeholder substems
    split = client.post(f"/api/isolation/session/{sid}/split-substems")
    assert split.status_code == 200
    subs = split.json()["substems"]
    assert len(subs) == 5
    assert all(not s["is_placeholder"] for s in subs)

    # Preview and stream audio via /audio/preview and /audio/parent
    prev = client.post(f"/api/isolation/session/{sid}/preview")
    assert prev.status_code == 200
    assert prev.json()["status"] == "mixed"

    parent_stream = client.get(f"/api/isolation/session/{sid}/audio/parent")
    assert parent_stream.status_code == 200
    preview_stream = client.get(f"/api/isolation/session/{sid}/audio/preview")
    assert preview_stream.status_code == 200

    # Export with custom format=flac, sample_rate=48000, bit_depth=16
    exp = client.post(f"/api/isolation/session/{sid}/export-loop")
    assert exp.status_code == 200
    out_path = Path(exp.json()["output_path"])
    assert out_path.suffix == ".flac"
    assert out_path.is_file()
    info = sf.info(str(out_path))
    assert info.samplerate == 48000
    # 2.0s loop_length_seconds with grid_snap="1_bar" at 125 BPM (1 bar = 1.92s) -> 1.92s
    assert abs(info.duration - 1.92) < 0.05

    # Partial export_settings patch preserves existing loop_length_seconds and bpm
    partial_patch = client.patch(
        f"/api/isolation/session/{sid}",
        json={"export_settings": {"format": "wav"}},
    )
    assert partial_patch.status_code == 200
    es_after = partial_patch.json()["export_settings"]
    assert es_after["format"] == "wav"
    assert es_after["loop_length_seconds"] == 2.0
    assert es_after["bpm"] == 125.0

    # Out-of-bounds / inverted region_start=5.0, region_end=1.0 on a 2.0s parent clears stale substems and normalizes bounds
    region_patch = client.patch(
        f"/api/isolation/session/{sid}",
        json={"region_start": 5.0, "region_end": 1.0},
    )
    assert region_patch.status_code == 200
    assert region_patch.json()["substems"] == []
    extracted = client.post(f"/api/isolation/session/{sid}/extract-region")
    assert extracted.status_code == 200
    ext_data = extracted.json()
    assert ext_data["status"] == "extracted"
    assert ext_data["region_start"] == 0.0
    assert ext_data["region_end"] > 0.0
    sliced_samples, _ = sf.read(ext_data["output_path"])
    assert float(np.max(np.abs(sliced_samples))) > 0.1

