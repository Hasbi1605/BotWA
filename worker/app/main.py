from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import structlog

from app.routers import health, summary, pdf, schedule, chat, memory
from app.config import get_settings

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("Starting RembugBot Worker", environment=settings.environment)
    yield
    logger.info("Shutting down RembugBot Worker")


app = FastAPI(
    title="RembugBot AI Worker",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(summary.router, prefix="/api/v1", tags=["summary"])
app.include_router(pdf.router, prefix="/api/v1", tags=["pdf"])
app.include_router(schedule.router, prefix="/api/v1", tags=["schedule"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(memory.router, prefix="/api/v1", tags=["memory"])
