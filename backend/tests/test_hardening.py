"""Production-hardening tests: path jail, kill allowlist, stats, extract."""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def test_health_has_version():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["version"]


def test_download_file_rejects_escape():
    resp = client.get("/api/download-file", params={"path": "/etc/passwd"})
    assert resp.status_code == 403


def test_download_file_rejects_library_db():
    db = settings.MUSIC_LIBRARY / "library.db"
    db.parent.mkdir(parents=True, exist_ok=True)
    db.touch()
    resp = client.get("/api/download-file", params={"path": str(db)})
    assert resp.status_code == 403


def test_serve_audio_rejects_traversal():
    resp = client.get("/audio/../etc/passwd")
    assert resp.status_code in {403, 404}


def test_kill_refuses_pid_one():
    resp = client.post("/api/system/kill/1")
    assert resp.status_code == 403


def test_kill_refuses_self():
    resp = client.post(f"/api/system/kill/{os.getpid()}")
    assert resp.status_code == 403


def test_upload_rejects_non_audio():
    resp = client.post(
        "/api/ingest/upload",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400


def test_library_stats_shape():
    resp = client.get("/api/library/stats")
    assert resp.status_code == 200
    data = resp.json()
    for key in ("total_tracks", "stems_ready", "loops_exported", "processing"):
        assert key in data


def test_extract_region_placeholder_without_parent():
    resp = client.post(
        "/api/isolation/session",
        json={"parent_stem_name": "vocals", "bpm": 120.0, "region_start": 0, "region_end": 8},
    )
    assert resp.status_code == 201
    sid = resp.json()["id"]
    extracted = client.post(f"/api/isolation/session/{sid}/extract-region")
    assert extracted.status_code == 200
    assert extracted.json()["status"] == "placeholder"


def test_extract_region_slices_parent_stem():
    sr = 44100
    audio = np.zeros(sr * 4, dtype="float32")
    audio[sr : sr * 2] = 0.5
    parent = settings.MUSIC_LIBRARY / "stems" / "parent.wav"
    parent.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(parent), audio, sr)

    session = client.post(
        "/api/isolation/session",
        json={
            "parent_stem_name": "drums",
            "parent_stem_path": str(parent),
            "bpm": 120.0,
            "region_start": 1.0,
            "region_end": 2.0,
        },
    )
    assert session.status_code == 201, session.text
    sid = session.json()["id"]
    extracted = client.post(f"/api/isolation/session/{sid}/extract-region")
    assert extracted.status_code == 200
    data = extracted.json()
    assert data["status"] == "extracted"
    out = Path(data["output_path"])
    assert out.is_file()
    sliced, out_sr = sf.read(str(out))
    assert abs(len(sliced) / out_sr - 1.0) < 0.08


def test_split_and_export_real_bands():
    sr = 44100
    t = np.linspace(0, 1.0, sr, endpoint=False)
    # energy in low + high so bands are non-silent
    audio = (0.4 * np.sin(2 * np.pi * 80 * t) + 0.3 * np.sin(2 * np.pi * 4000 * t)).astype("float32")
    parent = settings.MUSIC_LIBRARY / "stems" / "mix.wav"
    parent.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(parent), audio, sr)

    session = client.post(
        "/api/isolation/session",
        json={
            "parent_stem_name": "mix",
            "parent_stem_path": str(parent),
            "bpm": 120.0,
            "region_start": 0.0,
            "region_end": 1.0,
        },
    )
    assert session.status_code == 201, session.text
    sid = session.json()["id"]
    split = client.post(f"/api/isolation/session/{sid}/split-substems")
    assert split.status_code == 200, split.text
    data = split.json()
    assert len(data["substems"]) == 5
    for sub in data["substems"]:
        assert sub["is_placeholder"] is False
        assert sub["file_path"]
        assert Path(sub["file_path"]).is_file()
        assert len(sub["waveform_peaks"]) == 200

    exported = client.post(f"/api/isolation/session/{sid}/export-loop")
    assert exported.status_code == 200
    body = exported.json()
    assert body["status"] == "exported"
    assert body["output_path"]
    assert Path(body["output_path"]).is_file()
