from fastapi import APIRouter, Depends, Header
import structlog
from pydantic import BaseModel, Field

from app.auth import verify_token
from app.services.memory_service import MemoryService

router = APIRouter()
logger = structlog.get_logger()


class MemItem(BaseModel):
    kind: str = "fact"
    mem_key: str = ""
    content: str = ""
    confidence: float = 0.7


class ChatLine(BaseModel):
    sender_name: str = ""
    content: str = ""


class MemoryConsolidateRequest(BaseModel):
    group_id: int | None = None
    group_name: str = ""
    existing: list[MemItem] = Field(default_factory=list)
    messages: list[ChatLine] = Field(default_factory=list)


@router.post("/memory/consolidate")
async def consolidate_memory(
    request: MemoryConsolidateRequest,
    token: str = Depends(verify_token),
    x_request_id: str = Header(None, alias="X-Request-ID"),
):
    logger.info(
        "Memory consolidate",
        request_id=x_request_id,
        group_id=request.group_id,
        existing=len(request.existing),
        messages=len(request.messages),
    )
    service = MemoryService()
    items = await service.consolidate(
        group_name=request.group_name,
        existing=[m.model_dump() for m in request.existing],
        messages=[m.model_dump() for m in request.messages],
    )
    return {"status": "ok", "items": items}
