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
