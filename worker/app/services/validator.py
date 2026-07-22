from __future__ import annotations
import re
import structlog
from dataclasses import dataclass

from app.schemas.summary_output import SummaryOutput
from app.services.preprocessor import PreprocessResult

logger = structlog.get_logger()

PERSON_RE = re.compile(r"PERSON_\d{3}")


@dataclass
class ValidationResult:
    errors: list[str]
    can_publish: bool


class SummaryValidator:
    """Validates AI summary output against source messages (anti-hallucination)."""

    def validate(self, output: SummaryOutput, processed: PreprocessResult) -> ValidationResult:
        errors: list[str] = []
        message_map = {m["id"]: m for m in processed.messages}
        window_aliases = {m["alias"] for m in processed.messages}
        # original names (lowercase) that actually sent messages in this window
        window_names = {
            (m.get("original_name") or "").strip().lower()
            for m in processed.messages
            if (m.get("original_name") or "").strip()
        }

        # Check important_messages
        for msg in output.important_messages:
            if msg.source_message_id not in message_map:
                errors.append(f"Unknown message ID: {msg.source_message_id}")
                continue

            source = message_map[msg.source_message_id]

            normalized_source = " ".join(source["content"].split())
            normalized_quote = " ".join(msg.quote.split())
            if normalized_quote not in normalized_source:
                errors.append(
                    f"Quote not found in source {msg.source_message_id}: "
                    f"'{normalized_quote[:50]}...' not in '{normalized_source[:50]}...'"
                )

            if msg.speaker_alias != source["alias"]:
                errors.append(
                    f"Speaker mismatch for {msg.source_message_id}: "
                    f"expected {source['alias']}, got {msg.speaker_alias}"
                )

        for decision in output.decisions:
            if not decision.source_message_ids:
                errors.append("Decision has no source messages")
            for msg_id in decision.source_message_ids:
                if msg_id not in message_map:
                    errors.append(f"Decision references unknown message: {msg_id}")

        for task in output.tasks:
            if not task.source_message_ids:
                errors.append("Task has no source messages")
            for msg_id in task.source_message_ids:
                if msg_id not in message_map:
                    errors.append(f"Task references unknown message: {msg_id}")

            if task.assignee_alias:
                found_explicit = False
                for msg_id in task.source_message_ids:
                    source = message_map.get(msg_id)
                    if source and task.assignee_alias in source.get("content", ""):
                        found_explicit = True
                        break
                if not found_explicit:
                    task.assignee_alias = None

        for candidate in output.schedule_candidates:
            if not candidate.source_message_ids:
                errors.append("Schedule candidate has no source messages")
            for msg_id in candidate.source_message_ids:
                if msg_id not in message_map:
                    errors.append(f"Schedule candidate references unknown message: {msg_id}")

        for highlight in output.highlights:
            if not highlight.source_message_ids:
                errors.append("Highlight has no source messages")
            for msg_id in highlight.source_message_ids:
                if msg_id not in message_map:
                    errors.append(f"Highlight references unknown message: {msg_id}")

        # PERSON_xxx in free text must be in the window
        for field_name, text in (
            ("narrative", output.narrative or ""),
            *[(f"highlight[{i}]", h.text) for i, h in enumerate(output.highlights)],
        ):
            for person in PERSON_RE.findall(text):
                if person not in window_aliases:
                    errors.append(
                        f"{field_name} mentions {person} who did not send messages in window"
                    )

        # Strict evidence policy for hard errors
        can_publish = len(errors) == 0

        # Soft repair: drop/fix free-text name swaps in narrative/highlights
        # even when using real names (not PERSON_xxx)
        if can_publish:
            self._sanitize_speaker_names(output, processed, window_names)

        return ValidationResult(errors=errors, can_publish=can_publish)

    def _sanitize_speaker_names(
        self,
        output: SummaryOutput,
        processed: PreprocessResult,
        window_names: set[str],
    ) -> None:
        """
        If model names people who never spoke in the window, rewrite using
        speakers from cited source_message_ids (highlights) or drop the name claim.
        """
        message_map = {m["id"]: m for m in processed.messages}
        alias_to_name = {
            m["alias"]: (m.get("original_name") or m["alias"]) for m in processed.messages
        }
        # All real names present in window (for narrative scan)
        # Also include PERSON aliases as themselves for safety
        allowed_display = set(window_names)

        # Build list of "known names" that might be hallucinated: any PERSON remapped name
        # We only strip names that look like capitalized words matching directory-style
        # if they're NOT in window_names — but only when we have a clear wrong attribution pattern.

        for h in output.highlights:
            cited_names: set[str] = set()
            for mid in h.source_message_ids:
                src = message_map.get(mid)
                if not src:
                    continue
                cited_names.add((src.get("original_name") or "").strip().lower())
                cited_names.add(src["alias"].lower())
                # also display form from alias map
                name = alias_to_name.get(src["alias"], "")
                if name:
                    cited_names.add(name.lower())

            # Replace PERSON_xxx in highlight with correct names only from cited
            text = h.text
            for person in PERSON_RE.findall(text):
                if person not in {m["alias"] for m in processed.messages}:
                    continue
                # if person not among cited sources, replace with first cited speaker alias
                cited_aliases = []
                for mid in h.source_message_ids:
                    src = message_map.get(mid)
                    if src:
                        cited_aliases.append(src["alias"])
                if person not in cited_aliases and cited_aliases:
                    text = text.replace(person, cited_aliases[0])
            h.text = text

        # Narrative: if PERSON_xxx not in window (already error), for remaining PERSON ok
        # Soft fix: ensure documents don't invent "Google Drive" without drive.google
        docs: list[str] = []
        for d in output.documents or []:
            s = str(d)
            lower = s.lower()
            if "google drive" in lower and "drive.google" not in lower and "docs.google" not in lower:
                s = re.sub(
                    r"[Gg]oogle\s*[Dd]rive",
                    "tautan Google (share.google/Maps/dll.)",
                    s,
                )
            docs.append(s)
        output.documents = docs
