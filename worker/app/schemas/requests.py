from pydantic import BaseModel
from typing import Optional


class MessageInput(BaseModel):
    id: int
    content: str
    sender_name: str
    timestamp: str
    reply_to: Optional[str] = None
    type: str = "text"


class SummaryRequest(BaseModel):
    group_id: int
    window: dict  # {start: ISO-8601, end: ISO-8601}
    messages: list[MessageInput]
    mode: str = "normal"  # normal | roast


class DocumentInput(BaseModel):
    id: int
    content: str
    filename: str


class PdfAnalyzeRequest(BaseModel):
    document_id: int
    file_path: str
    metadata: dict  # {filename: str, page_count: int|None}


class ScheduleMessageInput(BaseModel):
    id: int
    content: str
    sender_name: str
    timestamp: str


class ScheduleDetectRequest(BaseModel):
    group_id: int
    messages: list[ScheduleMessageInput]
    reference_time: str
