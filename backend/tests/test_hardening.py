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


def test_routes_reject_paths_outside_music_library(tmp_path: Path):
    outside_wav = tmp_path / "outside.wav"
    sr = 22050
    sf.write(str(outside_wav), np.zeros(sr, dtype="float32"), sr)

    # Analysis routes
    assert client.post("/api/analysis/analyze", json={"audio_path": str(outside_wav)}).status_code == 403
    assert (
        client.post(
            "/api/analysis/mashup-score",
            params={"track1_path": str(outside_wav), "track2_path": str(outside_wav)},
        ).status_code
        == 403
    )

    # Processing routes
    assert (
        client.post(
            "/api/processing/process",
            json={"audio_path": str(outside_wav), "artist": "A", "title": "B"},
        ).status_code
        == 403
    )
    assert (
        client.post("/api/processing/extract-sample", json={"audio_path": str(outside_wav)}).status_code
        == 403
    )

    # Fingerprint routes
    assert client.post("/api/fingerprint/generate", json={"audio_path": str(outside_wav)}).status_code == 403
    assert (
        client.post(
            "/api/fingerprint/compare",
            json={"audio_path1": str(outside_wav), "audio_path2": str(outside_wav)},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/fingerprint/find-similar",
            json={"audio_path": str(outside_wav), "library_paths": [str(outside_wav)]},
        ).status_code
        == 403
    )

    # Export routes
    assert (
        client.post(
            "/api/export/rekordbox",
            json={"tracks": [str(outside_wav)], "output_path": "crate", "format": "rekordbox"},
        ).status_code
        == 403
    )


def test_daw_and_ableton_exports_work_and_enforce_confinement(tmp_path: Path):
    import zipfile
    from datetime import datetime, timezone
    from uuid import uuid4
    from app.services.pipeline import TrackRecord, pipeline

    sr = 22050
    t = np.linspace(0, 1.0, sr, endpoint=False)
    tone = (0.3 * np.sin(2 * np.pi * 220 * t)).astype("float32")

    track_id = uuid4()
    slug = f"export-test-{track_id.hex[:6]}"
    stems_dir = settings.resolved_stems_dir / slug
    stems_dir.mkdir(parents=True, exist_ok=True)
    drums_path = stems_dir / "drums.wav"
    sf.write(str(drums_path), tone, sr)

    rec = TrackRecord(
        track_id=track_id,
        title="Export Tune",
        artist="Tester",
        status="stems_ready",
        created_at=datetime.now(timezone.utc),
        slug=slug,
        original_path=drums_path,
        stems_dir=stems_dir,
        bpm=126.0,
        musical_key="8A",
        metadata={"duration": 1.0},
        stems=["drums.wav"],
    )
    pipeline._tracks[track_id] = rec

    # Reject stem traversal on MIDI and Ableton export
    bad_midi = client.post(f"/api/library/tracks/{track_id}/stems/..%2F..%2Fetc/midi")
    assert bad_midi.status_code in {400, 404}

    bad_ableton = client.post(
        "/api/export/ableton",
        json={"track_id": str(track_id), "stems": ["../../../etc/passwd"]},
    )
    assert bad_ableton.status_code == 400

    # Valid custom loop extraction writes inside MUSIC_LIBRARY/loops and streams via /audio
    custom_loop = client.post(
        f"/api/library/tracks/{track_id}/loops/custom",
        json={"start_time": 0.0, "end_time": 0.5, "stems": ["drums"]},
    )
    assert custom_loop.status_code == 200, custom_loop.text
    loop_file_url = custom_loop.json()["file_url"]
    dl = client.get(loop_file_url)
    assert dl.status_code == 200

    # Rekordbox, Serato, M3U exports succeed when given track ID or confined path
    rb = client.post(
        "/api/export/rekordbox",
        json={"tracks": [str(track_id)], "output_path": "my_rekordbox", "format": "rekordbox"},
    )
    assert rb.status_code == 200, rb.text
    assert Path(rb.json()["output_file"]).is_file()

    sr_exp = client.post(
        "/api/export/serato",
        json={"tracks": [str(drums_path)], "output_path": "my_serato", "format": "serato"},
    )
    assert sr_exp.status_code == 200, sr_exp.text
    assert Path(sr_exp.json()["output_file"]).is_dir()

    m3u = client.post(
        "/api/export/m3u",
        json={"tracks": [str(track_id)], "output_path": "my_playlist", "format": "m3u"},
    )
    assert m3u.status_code == 200, m3u.text
    assert Path(m3u.json()["output_file"]).is_file()

    # Reject output_path outside MUSIC_LIBRARY
    escape_out = client.post(
        "/api/export/m3u",
        json={"tracks": [str(track_id)], "output_path": str(tmp_path / "escape.m3u8"), "format": "m3u"},
    )
    assert escape_out.status_code == 403

    # Ableton export embeds AudioClip inside project.xml
    als = client.post(
        "/api/export/ableton",
        json={"track_id": str(track_id), "stems": ["drums"], "start_time": 0.0, "end_time": 1.0},
    )
    assert als.status_code == 200, als.text
    als_path = Path(als.json()["output_file"])
    assert als_path.is_file()
    with zipfile.ZipFile(als_path, "r") as zf:
        proj_xml = zf.read("project.xml").decode("utf-8")
        assert "<AudioClip" in proj_xml
        assert "Export Tune - drums" in proj_xml

    # Multi-stem custom loop with mixed sample rates (44100 Hz mono + 48000 Hz stereo) resamples accurately
    sr1, sr2 = 44100, 48000
    t1 = np.linspace(0, 1.0, sr1, endpoint=False)
    t2 = np.linspace(0, 1.0, sr2, endpoint=False)
    s1 = (0.3 * np.sin(2 * np.pi * 220 * t1)).astype("float32")
    s2 = np.column_stack([
        (0.3 * np.sin(2 * np.pi * 440 * t2)).astype("float32"),
        (0.3 * np.sin(2 * np.pi * 440 * t2)).astype("float32"),
    ])
    sf.write(str(stems_dir / "a.wav"), s1, sr1)
    sf.write(str(stems_dir / "b.wav"), s2, sr2)
    rec.stems = ["a.wav", "b.wav"]

    mixed_loop = client.post(
        f"/api/library/tracks/{track_id}/loops/custom",
        json={"start_time": 0.0, "end_time": 0.5, "stems": ["a", "b"]},
    )
    assert mixed_loop.status_code == 200, mixed_loop.text
    loop_audio_resp = client.get(mixed_loop.json()["file_url"])
    assert loop_audio_resp.status_code == 200
    import io
    bounced, bounced_sr = sf.read(io.BytesIO(loop_audio_resp.content))
    assert bounced_sr == sr1
    expected = (0.3 * np.sin(2 * np.pi * 220 * t1[: sr1 // 2]) + 0.3 * np.sin(2 * np.pi * 440 * t1[: sr1 // 2]))
    corr = float(np.corrcoef(bounced[:, 0], expected)[0, 1])
    assert corr > 0.99

    # Ableton glob fallback rejects symlinks pointing outside MUSIC_LIBRARY
    sym_tid = uuid4()
    sym_slug = f"sym-{sym_tid.hex[:6]}"
    sym_dir = settings.resolved_stems_dir / sym_slug
    sym_dir.mkdir(parents=True, exist_ok=True)
    outside_target = tmp_path / "secret.wav"
    sf.write(str(outside_target), tone, sr)
    (sym_dir / "drums.wav").symlink_to(outside_target)
    pipeline._tracks[sym_tid] = TrackRecord(
        track_id=sym_tid,
        title="Symlink Track",
        artist="Attacker",
        status="stems_ready",
        created_at=datetime.now(timezone.utc),
        slug=sym_slug,
        stems_dir=sym_dir,
        stems=["drums.wav"],
    )
    sym_als = client.post(
        "/api/export/ableton",
        json={"track_id": str(sym_tid), "stems": ["nonexistent"]},
    )
    assert sym_als.status_code == 400
