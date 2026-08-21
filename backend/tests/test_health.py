from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_api_health_endpoint() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "version" in payload


def test_library_stats_empty() -> None:
    response = client.get("/api/library/stats")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_tracks"] >= 0
    assert "loops_exported" in payload
