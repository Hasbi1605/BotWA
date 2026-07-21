from __future__ import annotations
import structlog

from app.providers.cascade import ProviderCascade

logger = structlog.get_logger()

LC_SYSTEM_PROMPT = """Kamu adalah RembugBot dalam mode *Loss Control (LC)* di grup WhatsApp KKN/desa Indonesia.

GAYA:
- Helpful dulu: jawab pertanyaan, beri saran praktis, klarifikasi, dorong keputusan.
- Lucu & sedikit roasting (seperti temen galak tapi sayang) — BUKAN bully.
- Bahasa Indonesia santai, cocok gen Z / mahasiswa KKN, boleh emoji sparingly.
- Pendek: 1–4 kalimat atau max ~6 baris. Cocok di HP. Jangan essay.
- Boleh sarkas ringan ke pola chat (siap doang, ghosting, telat), jangan SARA / body shaming / doxxing.

ATURAN:
1. Balas seolah ikut ngobrol di grup — tidak perlu sebut "sebagai AI".
2. Pakai konteks chat terbaru bila relevan.
3. Jangan mengarang jadwal/keputusan grup yang tidak ada di konteks.
4. Jika pesan cuma "ok/siap/wkwk", balas singkat atau guyon 1 baris — jangan ceramah.
5. Jika ada pertanyaan faktual di luar konteks grup, jawab singkat + jujur kalau tidak yakin.
6. JANGAN format markdown panjang; WhatsApp: *bold* / _italic_ secukupnya.
7. Jangan spam ajakan "ketik perintah bot".

Output: HANYA teks balasan untuk dikirim ke grup (tanpa JSON, tanpa prefix "Bot:")."""


class ChatService:
    def __init__(self):
        self.cascade = ProviderCascade()

    async def reply_lc(
        self,
        *,
        group_name: str,
        sender_name: str,
        message: str,
        recent: list[dict],
    ) -> str:
        lines = [
            f"Grup: {group_name or 'WhatsApp'}",
            f"Pengirim sekarang: {sender_name or 'Anggota'}",
            "",
            "Konteks chat terbaru (lama → baru):",
        ]
        for m in recent[-16:]:
            who = m.get("sender_name") or "Anggota"
            body = (m.get("content") or "").strip().replace("\n", " ")
            if not body:
                continue
            if len(body) > 280:
                body = body[:280] + "…"
            lines.append(f"- {who}: {body}")
        lines.append("")
        lines.append(f"Pesan yang harus dibalas sekarang ({sender_name}):")
        lines.append(message.strip())

        user_content = "\n".join(lines)
        last_error = None
        for route in self.cascade.get_routes("chat"):
            try:
                result = await self.cascade.call(
                    route=route,
                    system_prompt=LC_SYSTEM_PROMPT,
                    user_content=user_content,
                )
                text = (result.content or "").strip()
                # Strip accidental code fences / labels
                if text.startswith("```"):
                    text = text.strip("`").strip()
                if len(text) > 900:
                    text = text[:880].rsplit(" ", 1)[0] + "…"
                if text:
                    return text
            except Exception as e:
                logger.warning("LC chat route failed", route=route.id, error=str(e))
                last_error = str(e)
                continue
        raise RuntimeError(f"LC chat failed: {last_error}")
