from fastapi.testclient import TestClient

from app.main import app


def test_liveness_is_public():
    with TestClient(app) as client:
        response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_requires_bearer_token():
    with TestClient(app) as client:
        assert client.get("/health/ready").status_code == 401
        assert client.get(
            "/health/ready",
            headers={"Authorization": "Bearer wrong"},
        ).status_code == 401


def test_readiness_reports_config_and_temp_dir():
    with TestClient(app) as client:
        response = client.get(
            "/health/ready",
            headers={"Authorization": "Bearer test-worker-token"},
        )
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "checks": {"config": "ok", "ai_tokens": "ok", "temp_dir": "ok"},
    }
