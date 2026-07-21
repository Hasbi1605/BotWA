import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch, tmp_path):
    monkeypatch.setenv("WORKER_AUTH_TOKEN", "test-worker-token")
    monkeypatch.setenv("TEMP_DIR", str(tmp_path))
    monkeypatch.setenv("GH_MODELS_TOKEN_A", "github-token-a")
    monkeypatch.setenv("GH_MODELS_TOKEN_B", "github-token-b")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
