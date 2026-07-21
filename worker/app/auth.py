from fastapi import Depends, HTTPException, Header
from app.config import get_settings


async def verify_token(authorization: str = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization scheme")

    settings = get_settings()
    if not settings.worker_auth_token:
        raise HTTPException(status_code=500, detail="Worker auth token not configured")

    if token != settings.worker_auth_token:
        raise HTTPException(status_code=401, detail="Invalid token")

    return token
