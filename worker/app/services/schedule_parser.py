from __future__ import annotations
import re
import json
import structlog
from datetime import datetime, timedelta
from typing import Any

from app.providers.cascade import ProviderCascade

logger = structlog.get_logger()


class ScheduleParser:
    """Detects schedule candidates from messages using local parsing + AI fallback."""

    # Indonesian day names
    DAYS = {
        "senin": 0, "selasa": 1, "rabu": 2, "kamis": 3,
        "jumat": 4, "sabtu": 5, "minggu": 6,
    }

    # Ambiguous time indicators
    AMBIGUOUS_TIME = {"malam", "nanti", "siang", "pagi", "sore", "subuh", "maghrib"}

    # Ambiguous date indicators
    AMBIGUOUS_DATE = {"minggu depan", "bulan depan", "besok", "lusa", "nanti"}

    # Schedule-related keywords
    SCHEDULE_KEYWORDS = [
        "rapat", "meeting", "pertemuan", "kumpul", "acara", "kegiatan",
        "jadwal", "agenda", "kerja bakti", "gotong royong", "pengajian",
        "pelatihan", "workshop", "seminar", "presentasi",
        "deadline", "tenggat", "batas waktu", "pengumpulan",
    ]

    # Cancel keywords
    CANCEL_KEYWORDS = ["batal", "batalkan", "dibatalkan", "tidak jadi", "gak jadi", "gajadi"]

    async def detect(self, request) -> list[dict[str, Any]]:
        """Detect schedule candidates from messages."""
        candidates = []
        seen_titles = set()

        for msg in request.messages:
            content = msg.content.lower().strip()
            if not content:
                continue

            # Check if this looks like a schedule
            if not self._is_schedule_related(content):
                continue

            # Check if it's a cancellation
            if any(kw in content for kw in self.CANCEL_KEYWORDS):
                continue

            # Extract date/time info
            date_info = self._extract_date(content, msg.timestamp)
            time_info = self._extract_time(content)
            location = self._extract_location(content)

            # Determine ambiguities
            ambiguities = []
            if date_info.get("ambiguous"):
                ambiguities.append(f"tanggal tidak pasti: {date_info['ambiguous']}")
            if time_info.get("ambiguous"):
                ambiguities.append(f"waktu tidak pasti: {time_info['ambiguous']}")

            # Generate title
            title = self._generate_title(content)
            if not title or title in seen_titles:
                continue
            seen_titles.add(title)

            candidates.append({
                "title": title,
                "date": date_info.get("date"),
                "time": time_info.get("time"),
                "location": location,
                "ambiguities": ambiguities,
                "source_message_ids": [msg.id],
            })

        # If local parsing found nothing or found ambiguous ones, try AI
        if not candidates or any(c["ambiguities"] for c in candidates):
            ai_candidates = await self._detect_with_ai(request)
            # Merge: prefer local, add unique AI candidates
            local_ids = set()
            for c in candidates:
                local_ids.update(c["source_message_ids"])

            for ai_c in ai_candidates:
                if not any(id in local_ids for id in ai_c.get("source_message_ids", [])):
                    candidates.append(ai_c)

        return candidates

    def _is_schedule_related(self, content: str) -> bool:
        return any(kw in content for kw in self.SCHEDULE_KEYWORDS)

    def _extract_date(self, content: str, reference_timestamp: str) -> dict:
        """Extract date from content relative to message timestamp."""
        from dateparser.search import search_dates

        # Try explicit date patterns
        date_match = re.search(
            r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", content
        )
        if date_match:
            day, month, year = date_match.groups()
            if len(year) == 2:
                year = "20" + year
            return {"date": f"{year}-{month.zfill(2)}-{day.zfill(2)}"}

        # Try relative dates with dateparser
        try:
            ref_date = datetime.fromisoformat(reference_timestamp.replace("Z", "+00:00"))
            results = search_dates(
                content,
                languages=["id"],
                settings={
                    "RELATIVE_BASE": ref_date,
                    "PREFER_DATES_FROM": "future",
                },
            )
            if results:
                _, parsed_date = results[0]
                # Check for ambiguous terms
                ambiguous = None
                for term in self.AMBIGUOUS_DATE:
                    if term in content:
                        ambiguous = term
                        break
                return {
                    "date": parsed_date.strftime("%Y-%m-%d"),
                    "ambiguous": ambiguous,
                }
        except Exception as e:
            logger.debug("Date parsing failed", error=str(e))

        # Check for day names
        for day_name, _ in self.DAYS.items():
            if day_name in content:
                # Calculate next occurrence
                try:
                    ref_date = datetime.fromisoformat(reference_timestamp.replace("Z", "+00:00"))
                    target_day = self.DAYS[day_name]
                    days_ahead = (target_day - ref_date.weekday()) % 7
                    if days_ahead == 0:
                        days_ahead = 7
                    target_date = ref_date + timedelta(days=days_ahead)
                    return {
                        "date": target_date.strftime("%Y-%m-%d"),
                        "ambiguous": None,
                    }
                except Exception:
                    pass

        return {"date": None, "ambiguous": "tanggal belum ditentukan"}

    def _extract_time(self, content: str) -> dict:
        """Extract time from content."""
        # Explicit time patterns
        time_match = re.search(
            r"\b(\d{1,2})[:.](\d{2})\s*(wib|pagi|siang|sore|malam)?\b",
            content,
            re.IGNORECASE,
        )
        if time_match:
            hour = int(time_match.group(1))
            minute = int(time_match.group(2))
            period = time_match.group(3)

            # Adjust for period
            if period:
                period = period.lower()
                if period == "malam" and hour < 12:
                    hour += 12
                elif period == "sore" and hour < 12:
                    hour += 12

            if 0 <= hour <= 23 and 0 <= minute <= 59:
                return {"time": f"{hour:02d}:{minute:02d}"}

        # Check for ambiguous time
        for term in self.AMBIGUOUS_TIME:
            if term in content:
                return {"time": None, "ambiguous": term}

        return {"time": None, "ambiguous": None}

    def _extract_location(self, content: str) -> str | None:
        """Extract location from content."""
        # Look for location indicators
        loc_patterns = [
            r"(?:di|@|lokasi|tempat)[:\s]+([^\n,.]+)",
            r"(?:balai|gedung|aula|masjid|kantor|rumah|sekolah|kampus)\s+([^\n,.]+)",
        ]
        for pattern in loc_patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                return match.group(1).strip()[:100]
        return None

    def _generate_title(self, content: str) -> str:
        """Generate a short title from message content."""
        # Try to extract the main activity
        for keyword in self.SCHEDULE_KEYWORDS:
            if keyword in content:
                # Find the context around the keyword
                idx = content.index(keyword)
                start = max(0, idx - 20)
                end = min(len(content), idx + len(keyword) + 30)
                title = content[start:end].strip()
                # Clean up
                title = re.sub(r"\s+", " ", title)
                return title[:80]

        return content[:80].strip()

    async def _detect_with_ai(self, request) -> list[dict[str, Any]]:
        """Use AI to detect schedules when local parsing is insufficient."""
        system_prompt = """Analisis percakapan grup berikut dan deteksi kandidat jadwal/kegiatan.

Cari percakapan yang mengindikasikan:
- Rapat, pertemuan, atau kumpul
- Acara atau kegiatan
- Deadline atau tenggat waktu
- Janji temu

JANGAN terjemahkan waktu yang ambigu (malam, nanti, minggu depan) menjadi waktu pasti.
Tandai bagian ambigu.

OUTPUT FORMAT (JSON):
{
  "candidates": [
    {
      "title": "judul kegiatan",
      "date": "YYYY-MM-DD|null",
      "time": "HH:mm|null",
      "location": "nama tempat|null",
      "ambiguities": ["bagian ambigu"],
      "source_message_ids": [id_pesan]
    }
  ]
}

Balikkan HANYA JSON."""

        messages_text = "\n".join(
            f"[{m.id}] {m.sender_name}: {m.content}"
            for m in request.messages
            if m.content.strip()
        )

        if not messages_text:
            return []

        user_content = f"Waktu referensi: {request.reference_time}\n\nPercakapan:\n{messages_text}"

        cascade = ProviderCascade()
        for route in cascade.get_routes("schedule"):
            try:
                result = await cascade.call(
                    route=route,
                    system_prompt=system_prompt,
                    user_content=user_content,
                    response_format={"type": "json_object"},
                )
                data = json.loads(result.content)
                return data.get("candidates", [])
            except Exception as e:
                logger.warning("Schedule AI route failed", route=route.id, error=str(e))
                continue

        return []
