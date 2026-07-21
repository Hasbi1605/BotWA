from __future__ import annotations
import structlog
from typing import Any
from dataclasses import dataclass

from app.schemas.summary_output import SummaryOutput
from app.services.preprocessor import PreprocessResult

logger = structlog.get_logger()


@dataclass
class ValidationResult:
    errors: list[str]
    can_publish: bool


class SummaryValidator:
    """Validates AI summary output against source messages (anti-hallucination)."""

    def validate(self, output: SummaryOutput, processed: PreprocessResult) -> ValidationResult:
        errors = []
        message_map = {m["id"]: m for m in processed.messages}

        # Check important_messages
        for msg in output.important_messages:
            if msg.source_message_id not in message_map:
                errors.append(f"Unknown message ID: {msg.source_message_id}")
                continue

            source = message_map[msg.source_message_id]

            # Quote must be exact substring (after whitespace normalization)
            normalized_source = " ".join(source["content"].split())
            normalized_quote = " ".join(msg.quote.split())
            if normalized_quote not in normalized_source:
                errors.append(
                    f"Quote not found in source {msg.source_message_id}: "
                    f"'{normalized_quote[:50]}...' not in '{normalized_source[:50]}...'"
                )

            # Speaker alias must match
            if msg.speaker_alias != source["alias"]:
                errors.append(
                    f"Speaker mismatch for {msg.source_message_id}: "
                    f"expected {source['alias']}, got {msg.speaker_alias}"
                )

        # Check decisions
        for decision in output.decisions:
            for msg_id in decision.source_message_ids:
                if msg_id not in message_map:
                    errors.append(f"Decision references unknown message: {msg_id}")

        # Check tasks
        for task in output.tasks:
            for msg_id in task.source_message_ids:
                if msg_id not in message_map:
                    errors.append(f"Task references unknown message: {msg_id}")

            # Unconfirmed assignees should be null
            if task.assignee_alias:
                # Verify assignee was explicitly mentioned
                found_explicit = False
                for msg_id in task.source_message_ids:
                    source = message_map.get(msg_id)
                    if source and task.assignee_alias in source.get("content", ""):
                        found_explicit = True
                        break
                if not found_explicit:
                    task.assignee_alias = None

        # Check schedule candidates
        for candidate in output.schedule_candidates:
            for msg_id in candidate.source_message_ids:
                if msg_id not in message_map:
                    errors.append(f"Schedule candidate references unknown message: {msg_id}")

        # Check highlights
        for highlight in output.highlights:
            for msg_id in highlight.source_message_ids:
                if msg_id not in message_map:
                    errors.append(f"Highlight references unknown message: {msg_id}")

        # Critical errors prevent publishing
        critical_errors = [e for e in errors if "Unknown message ID" in e or "Quote not found" in e]
        can_publish = len(critical_errors) == 0

        return ValidationResult(errors=errors, can_publish=can_publish)
