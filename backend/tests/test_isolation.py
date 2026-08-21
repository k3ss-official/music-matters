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
