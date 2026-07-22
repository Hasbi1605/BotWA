from __future__ import annotations
import json
import structlog

from app.providers.cascade import ProviderCascade

logger = structlog.get_logger()

MEMORY_SYSTEM_PROMPT = """Kamu membangun *memori jangka menengah* untuk bot grup WhatsApp KKN.

TUGAS: dari chat terbaru + memori lama, hasilkan daftar fakta yang berguna untuk balasan bot ke depan.

SIMPAN (contoh bagus):
- Panggilan/nama: "Acel sering dipanggil bendahara"
- Peran: "Hasbi bantu logistik"
- Kebiasaan: "Beberapa orang sering bilang siap tanpa update"
- Tempat/istilah grup: "SCH = titik kumpul survei"
- Keputusan berulang: "Proker utama SIKOFUN di minggu awal"
- Norma grup: "Suka bahasa santai / roast ringan"

JANGAN SIMPAN:
- Nomor HP, NIK, password, data sensitif
- Gosip menjatuhkan / body shaming / SARA
- Satu chat random yang tidak akan berguna besok
- Salin transcript panjang

ATURAN:
1. Maksimal 12 item output per run (yang paling berguna).
2. mem_key singkat snake/latin (contoh: alias_acel, place_sch, habit_siap).
3. content 1 kalimat padat (max ~120 karakter).
4. kind: fact | person | norm | alias
5. action: upsert (default) atau delete (jika memori lama salah/basi)
6. confidence 0.4–0.95
7. Jangan mengarang di luar chat/memori yang diberikan.

OUTPUT JSON SAJA:
{
  "items": [
    {"kind": "alias", "mem_key": "alias_acel", "content": "...", "confidence": 0.8, "action": "upsert"}
  ]
}
"""


class MemoryService:
    def __init__(self):
        self.cascade = ProviderCascade()

    async def consolidate(
        self,
        *,
        group_name: str,
        existing: list[dict],
        messages: list[dict],
    ) -> list[dict]:
        lines = [
            f"Grup: {group_name or 'WhatsApp'}",
            "",
            "Memori lama:",
        ]
        if existing:
            for m in existing[:40]:
                lines.append(
                    f"- [{m.get('kind')}] {m.get('mem_key')}: {m.get('content')} "
                    f"(conf={m.get('confidence', 0.7)})"
                )
        else:
            lines.append("(belum ada)")

        lines.append("")
        lines.append("Cuplikan chat terbaru:")
        for msg in messages[-80:]:
            who = msg.get("sender_name") or "Anggota"
            body = (msg.get("content") or "").strip().replace("\n", " ")
            if not body:
                continue
            if len(body) > 220:
                body = body[:220] + "…"
            lines.append(f"- {who}: {body}")

        user_content = "\n".join(lines)
        last_error = None
        for route in self.cascade.get_routes("chat"):
            try:
                result = await self.cascade.call(
                    route=route,
                    system_prompt=MEMORY_SYSTEM_PROMPT,
                    user_content=user_content,
                    response_format={"type": "json_object"},
                )
                data = json.loads(result.content)
                items = data.get("items") if isinstance(data, dict) else None
                if not isinstance(items, list):
                    continue
                cleaned = []
                for it in items[:12]:
                    if not isinstance(it, dict):
                        continue
                    key = str(it.get("mem_key") or it.get("key") or "").strip()
                    content = str(it.get("content") or "").strip()
                    action = str(it.get("action") or "upsert").lower()
                    if not key:
                        continue
                    if action not in ("delete", "remove") and not content:
                        continue
                    cleaned.append(
                        {
                            "kind": it.get("kind") or "fact",
                            "mem_key": key[:120],
                            "content": content[:500],
                            "confidence": float(it.get("confidence") or 0.7),
                            "action": action,
                        }
                    )
                return cleaned
            except Exception as e:
                logger.warning("Memory consolidate route failed", route=route.id, error=str(e))
                last_error = str(e)
                continue
        raise RuntimeError(f"Memory consolidate failed: {last_error}")
