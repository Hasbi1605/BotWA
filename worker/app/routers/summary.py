from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from typing import Optional
import structlog

from app.auth import verify_token
from app.services.summary_service import SummaryService
from app.schemas.requests import SummaryRequest
from app.schemas.summary_output import SummaryOutput

router = APIRouter()
logger = structlog.get_logger()


@router.post("/summary")
async def create_summary(
    request: SummaryRequest,
    token: str = Depends(verify_token),
    x_request_id: str = Header(None, alias="X-Request-ID"),
    idempotency_key: str = Header(None, alias="Idempotency-Key"),
):
    logger.info(
        "Summary request received",
        request_id=x_request_id,
        idempotency_key=idempotency_key,
        group_id=request.group_id,
        message_count=len(request.messages),
    )

    service = SummaryService()
    result = await service.generate_summary(request)

    output = result.output
    if hasattr(output, "model_dump"):
        output = output.model_dump()

    return {"status": "ok", "output": output, "model_route": result.model_route}
