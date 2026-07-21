from fastapi import APIRouter, Depends, Header
import structlog

from app.auth import verify_token
from app.services.schedule_parser import ScheduleParser
from app.schemas.requests import ScheduleDetectRequest

router = APIRouter()
logger = structlog.get_logger()


@router.post("/schedule/detect")
async def detect_schedules(
    request: ScheduleDetectRequest,
    token: str = Depends(verify_token),
    x_request_id: str = Header(None, alias="X-Request-ID"),
):
    logger.info(
        "Schedule detect request",
        request_id=x_request_id,
        group_id=request.group_id,
        message_count=len(request.messages),
    )

    parser = ScheduleParser()
    candidates = await parser.detect(request)

    return {"status": "ok", "candidates": candidates}
