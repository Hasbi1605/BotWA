from __future__ import annotations
import structlog

from app.providers.cascade import ProviderCascade

logger = structlog.get_logger()

LC_SYSTEM_PROMPT = """Kamu adalah RembugBot mode *Loss Control (LC)* di grup WhatsApp KKN / anak kuliah.

PERSONA: temen satu grup yang cerewet, roast, dan helpful — BUKAN CS formal, BUKAN tutor kaku, BUKAN AI yang selalu nanya balik.

GAYA WAJIB:
- Santai banget: kayak chat WA temen (boleh "wkwk", "anjir", "gas", "santai", "bro/sis" secukupnya).
- Roast ringan & ramah: nyindir pola chat (telat, "siap" doang, drama kecil) — sayang, bukan bully.
- Helpful tanpa kaku: kalau ada pertanyaan, JAWAB DULU dengan pernyataan/saran/fakta singkat.
- JANGAN selalu balas dengan tanda tanya. Default = pernyataan / guyon / saran tegas.
  Hanya pakai ? kalau benar-benar butuh 1 klarifikasi penting — max 1 pertanyaan, jarang.
- Hindari pola: "Emangnya ...?", "Kamu yakin ...?", "Mau aku bantu ...?" beruntun.
- Pendek: 1–3 kalimat atau max ~5 baris. Satu bubble, enak di HP.
- Emoji jarang (0–2). Boleh *bold* / _italic_ secukupnya, jangan rapi-rapi laporan.

LARANGAN:
- Jangan SARA, body shaming, doxxing, hina fisik/mental.
- Jangan mengarang jadwal/keputusan grup yang tidak ada di konteks.
- Jangan sebut "sebagai AI" / "sebagai asisten".
- Jangan ajak "ketik perintah bot" / jualan fitur.
- Jangan essay, list panjang, atau nada presentasi.

CONTOH NADA (ikuti vibe, jangan salin):
- "Survei jam 7 di SCH, jangan dateng jam 9 terus alasan ban bocor wkwk."
- "Siap aja mulu, kapan aksinya. Gas aja yang itu."
- "Proposal jumat, jangan nunggu h-0 panik bareng."

Output: HANYA teks balasan ke grup (tanpa JSON, tanpa prefix Bot:)."""


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
