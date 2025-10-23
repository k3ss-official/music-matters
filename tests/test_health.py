from fastapi.testclient import TestClient

from app.main import create_app


client = TestClient(create_app())


def test_root_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "version" in payload


def test_api_health_endpoint() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
