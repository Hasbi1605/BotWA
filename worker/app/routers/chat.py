from fastapi import APIRouter, Depends, Header
import structlog

from app.auth import verify_token
from app.services.chat_service import ChatService
from pydantic import BaseModel, Field

router = APIRouter()
logger = structlog.get_logger()


class ChatMessage(BaseModel):
    sender_name: str = ""
    content: str = ""


class ChatLcRequest(BaseModel):
    group_id: int | None = None
    group_name: str = ""
    sender_name: str = ""
    message: str
    recent: list[ChatMessage] = Field(default_factory=list)


@router.post("/chat/lc")
async def chat_lc(
    request: ChatLcRequest,
    token: str = Depends(verify_token),
    x_request_id: str = Header(None, alias="X-Request-ID"),
):
    logger.info(
        "LC chat request",
        request_id=x_request_id,
        group_id=request.group_id,
        message_len=len(request.message or ""),
    )
    service = ChatService()
    text = await service.reply_lc(
        group_name=request.group_name,
        sender_name=request.sender_name,
        message=request.message,
        recent=[m.model_dump() for m in request.recent],
    )
    return {"status": "ok", "reply": text}
