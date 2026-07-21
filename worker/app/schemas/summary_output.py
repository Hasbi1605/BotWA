from pydantic import BaseModel
from typing import Optional


class Highlight(BaseModel):
    text: str
    source_message_ids: list[int]


class ImportantMessage(BaseModel):
    speaker_alias: str
    quote: str
    source_message_id: int


class Decision(BaseModel):
    text: str
    status: str  # confirmed, tentative, disputed
    source_message_ids: list[int]


class Task(BaseModel):
    text: str
    assignee_alias: Optional[str] = None
    due_at: Optional[str] = None
    source_message_ids: list[int]


class ScheduleCandidateOutput(BaseModel):
    title: str
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    ambiguities: list[str] = []
    source_message_ids: list[int]


class SharedLink(BaseModel):
    """URL shared in chat — filled deterministically, not by the model."""
    url: str
    sender_alias: Optional[str] = None
    source_message_id: Optional[int] = None


class TopSender(BaseModel):
    """Most active participants — filled deterministically."""
    alias: str
    count: int


class SummaryOutput(BaseModel):
    period: dict  # {start: ISO-8601, end: ISO-8601}
    activity: dict  # {message_count: int, participant_count: int}
    narrative: str
    highlights: list[Highlight] = []
    important_messages: list[ImportantMessage] = []
    decisions: list[Decision] = []
    tasks: list[Task] = []
    schedule_candidates: list[ScheduleCandidateOutput] = []
    documents: list[str] = []
    open_questions: list[str] = []
    # Deterministic enrichments (preprocessor / gateway may also fill these)
    links: list[SharedLink] = []
    top_senders: list[TopSender] = []
    # name -> PERSON_xxx for remapping at render time
    alias_map: dict[str, str] = {}
