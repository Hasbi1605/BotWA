from fastapi import APIRouter, Depends
from app.auth import verify_token

router = APIRouter()


@router.get("/health/live")
async def liveness():
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness(token: str = Depends(verify_token)):
    checks = {}

    # Check config
    from app.config import get_settings
    try:
        settings = get_settings()
        checks["config"] = "ok" if settings.worker_auth_token else "missing_token"
        checks["ai_tokens"] = (
            "ok"
            if settings.gh_models_token_a and settings.gh_models_token_b
            else "missing_tokens"
        )
    except Exception:
        checks["config"] = "error"

    # Check temp directory
    import os
    settings = get_settings()
    checks["temp_dir"] = "ok" if os.path.isdir(settings.temp_dir) else "missing"

    all_ok = all(v == "ok" for v in checks.values())
    return {
        "status": "ok" if all_ok else "degraded",
        "checks": checks,
    }
