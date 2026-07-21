from __future__ import annotations
import re
import structlog
from typing import Any
from urllib.parse import urlparse

logger = structlog.get_logger()

# URLs shared in WhatsApp chat (http/https + bare www.)
URL_RE = re.compile(
    r"(?P<url>https?://[^\s<>\"']+|www\.[^\s<>\"']+)",
    re.IGNORECASE,
)


class Preprocessor:
    """Removes noise, assigns pseudonym aliases, extracts links, ranks senders."""

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
            PreprocessResult with aliases, filtered messages, links, top senders.
        """
        # Assign aliases (stable order of first appearance)
        alias_map: dict[str, str] = {}
        alias_counter = 1
        sender_counts: dict[str, int] = {}

        for msg in messages:
            sender = msg.get("sender_name") or "Unknown"
            if sender not in alias_map:
                alias_map[sender] = f"PERSON_{alias_counter:03d}"
                alias_counter += 1
            sender_counts[sender] = sender_counts.get(sender, 0) + 1

        # Filter noise and build message list; extract links
        filtered = []
        links: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        stats = {"total": len(messages), "noise": 0, "text": 0, "media": 0}

        for msg in messages:
            content = (msg.get("content") or "").strip()
            msg_type = msg.get("type", "text")
            sender = msg.get("sender_name") or "Unknown"
            alias = alias_map.get(sender, "UNKNOWN")

            # Extract links even from short messages (before noise filter)
            for match in URL_RE.finditer(content):
                raw_url = match.group("url").rstrip(".,);]")
                normalized = raw_url if raw_url.lower().startswith("http") else f"https://{raw_url}"
                key = normalized.rstrip("/").lower()
                if key in seen_urls:
                    continue
                if not self._looks_like_url(normalized):
                    continue
                seen_urls.add(key)
                links.append({
                    "url": normalized,
                    "sender_alias": alias,
                    "source_message_id": msg.get("id"),
                })

            # Skip empty messages
            if not content and msg_type in ("sticker", "other"):
                stats["noise"] += 1
                continue

            # Check if noise (but keep messages that only share a link)
            if content and self._is_noise(content) and not URL_RE.search(content):
                stats["noise"] += 1
                continue

            # Classify
            if msg_type in ("text", "image", "video", "document"):
                stats["text"] += 1
            else:
                stats["media"] += 1

            filtered.append({
                "id": msg["id"],
                "alias": alias,
                "original_name": sender,
                "content": content,
                "timestamp": msg["timestamp"],
                "reply_to": msg.get("reply_to"),
                "type": msg_type,
            })

        # Top senders by raw message count (most active first)
        top_senders = sorted(
            (
                {"alias": alias_map[name], "count": count, "name": name}
                for name, count in sender_counts.items()
            ),
            key=lambda x: (-x["count"], x["alias"]),
        )[:8]

        return PreprocessResult(
            messages=filtered,
            alias_map=alias_map,
            stats=stats,
            links=links,
            top_senders=top_senders,
        )

    def _looks_like_url(self, url: str) -> bool:
        try:
            parsed = urlparse(url)
            return bool(parsed.netloc and "." in parsed.netloc)
        except Exception:
            return False

    def _is_noise(self, content: str) -> bool:
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
        links: list[dict[str, Any]] | None = None,
        top_senders: list[dict[str, Any]] | None = None,
    ):
        self.messages = messages
        self.alias_map = alias_map
        self.stats = stats
        self.links = links or []
        self.top_senders = top_senders or []

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
