from __future__ import annotations
import structlog
from typing import Any

logger = structlog.get_logger()


class Preprocessor:
    """Removes noise, assigns pseudonym aliases, and builds reply chains."""

    # Messages matching these patterns are considered noise
    NOISE_PATTERNS = [
        r"^(halo|hai|hi|hey|selamat pagi|selamat siang|selamat sore|selamat malam|pagi|siang|sore|malam|met pagi|met siang)\s*[!.]*$",
        r"^(ok|oke|siap|baik|noted|sip|mantap|mantul|gas|yuk|ayo)\s*[!.]*$",
        r"^[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\s]+$",  # emoji-only
        r"^(a+|e+i+|o+|u+)\s*[!.]*$",  # vowel elongation only
    ]

    def preprocess(self, messages: list[dict[str, Any]]) -> PreprocessResult:
        """
        Process raw messages into AI-ready format.

        Returns:
            PreprocessResult with aliases, filtered messages, and reply chains.
        """
        # Assign aliases
        alias_map = {}
        alias_counter = 1

        for msg in messages:
            sender = msg.get("sender_name", "Unknown")
            if sender not in alias_map:
                alias_map[sender] = f"PERSON_{alias_counter:03d}"
                alias_counter += 1

        # Filter noise and build message list
        filtered = []
        stats = {"total": len(messages), "noise": 0, "text": 0, "media": 0}

        for msg in messages:
            content = msg.get("content", "").strip()
            msg_type = msg.get("type", "text")

            # Skip empty messages
            if not content and msg_type in ("sticker", "other"):
                stats["noise"] += 1
                continue

            # Check if noise
            if content and self._is_noise(content):
                stats["noise"] += 1
                continue

            # Classify
            if msg_type in ("text", "image", "video", "document"):
                stats["text"] += 1
            else:
                stats["media"] += 1

            sender = msg.get("sender_name", "Unknown")
            alias = alias_map.get(sender, "UNKNOWN")

            filtered.append({
                "id": msg["id"],
                "alias": alias,
                "original_name": sender,
                "content": content,
                "timestamp": msg["timestamp"],
                "reply_to": msg.get("reply_to"),
                "type": msg_type,
            })

        return PreprocessResult(
            messages=filtered,
            alias_map=alias_map,
            stats=stats,
        )

    def _is_noise(self, content: str) -> bool:
        import re
        content_lower = content.lower().strip()
        for pattern in self.NOISE_PATTERNS:
            if re.match(pattern, content_lower, re.IGNORECASE):
                return True
        # Very short non-informative messages
        if len(content) <= 3 and not any(c.isalnum() for c in content):
            return True
        return False


class PreprocessResult:
    def __init__(
        self,
        messages: list[dict[str, Any]],
        alias_map: dict[str, str],
        stats: dict[str, int],
    ):
        self.messages = messages
        self.alias_map = alias_map
        self.stats = stats

    @property
    def participant_count(self) -> int:
        return len(self.alias_map)

    def get_alias(self, sender_name: str) -> str:
        return self.alias_map.get(sender_name, "UNKNOWN")

    def to_prompt_context(self) -> str:
        """Format messages for AI prompt with stable message IDs for evidence binding."""
        lines = []
        for msg in self.messages:
            # Format matches SUMMARY_SYSTEM_PROMPT: [id:NUMBER] [PERSON_XXX] isi
            prefix = f"[id:{msg['id']}] [{msg['alias']}]"
            if msg.get("reply_to"):
                prefix += f" (reply to {msg['reply_to']})"
            lines.append(f"{prefix} {msg['content']}")
        return "\n".join(lines)
