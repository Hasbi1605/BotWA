from __future__ import annotations
import structlog
from typing import Any

from app.schemas.requests import SummaryRequest
from app.schemas.summary_output import SummaryOutput
from app.services.preprocessor import Preprocessor
from app.services.validator import SummaryValidator
from app.providers.cascade import ProviderCascade

logger = structlog.get_logger()

SUMMARY_SYSTEM_PROMPT = """Kamu adalah asisten yang meringkas percakapan grup WhatsApp untuk kelompok KKN dan komunitas desa di Indonesia.

TUGAS:
Buat ringkasan terstruktur dari percakapan grup dalam format JSON.

ATURAN PENTING:
1. Kutipan harus PERSIS sama dengan pesan asli (boleh normalisasi whitespace)
2. Setiap keputusan, tugas, dan fakta penting HARUS memiliki source_message_id
3. Jangan mengarang keputusan - bedakan antara keputusan, usulan, opini, dan pertanyaan
4. Tugas hanya ditugaskan ke orang yang EKSPLISIT disebut dalam percakapan
5. Jika ada konflik atau perbedaan pendapat, sebutkan bahwa belum ada kesepakatan
6. Jadwal yang terdeteksi harus berstatus "kandidat" - jangan terjemahkan waktu yang ambigu
7. Gunakan Bahasa Indonesia yang jelas dan tidak terlalu teknis
8. Tanggal harus absolut (contoh: "Senin, 21 Juli 2026"), bukan relatif
9. Selalu sebutkan zona waktu WIB untuk waktu

OUTPUT FORMAT (JSON):
{
  "period": {"start": "ISO-8601", "end": "ISO-8601"},
  "activity": {"message_count": <int>, "participant_count": <int>},
  "narrative": "ringkasan naratif lengkap dalam bahasa Indonesia",
  "highlights": [{"text": "highlight", "source_message_ids": [<id>]}],
  "important_messages": [{"speaker_alias": "PERSON_001", "quote": "kutipan persis", "source_message_id": <id>}],
  "decisions": [{"text": "keputusan", "status": "confirmed|tentative|disputed", "source_message_ids": [<id>]}],
  "tasks": [{"text": "tugas", "assignee_alias": "PERSON_001|null", "due_at": "ISO-8601|null", "source_message_ids": [<id>]}],
  "schedule_candidates": [{"title": "judul", "date": "YYYY-MM-DD|null", "time": "HH:mm|null", "location": "null", "ambiguities": [], "source_message_ids": [<id>]}],
  "documents": ["deskripsi dokumen"],
  "open_questions": ["pertanyaan yang belum terjawab"]
}

Pesan akan diberikan dalam format:
[id:NUMBER] [PERSON_XXX] isi pesan

Balikkan HANYA JSON, tanpa markdown code block."""


class SummaryService:
    def __init__(self):
        self.preprocessor = Preprocessor()
        self.validator = SummaryValidator()
        self.cascade = ProviderCascade()

    async def generate_summary(self, request: SummaryRequest) -> SummaryResult:
        # Preprocess messages
        messages_dicts = [m.model_dump() for m in request.messages]
        processed = self.preprocessor.preprocess(messages_dicts)

        if not processed.messages:
            return SummaryResult(
                output=SummaryOutput(
                    period=request.window,
                    activity={"message_count": 0, "participant_count": 0},
                    narrative="Tidak ada pesan dalam periode ini.",
                ),
                model_route="none",
            )

        # Build context for AI
        context = self._build_context(processed, request.window)

        # Try provider cascade
        last_error = None
        for route in self.cascade.get_routes("summary"):
            try:
                result = await self.cascade.call(
                    route=route,
                    system_prompt=SUMMARY_SYSTEM_PROMPT,
                    user_content=context,
                    response_format={"type": "json_object"},
                )

                # Parse and validate
                output = SummaryOutput.model_validate_json(result.content)

                # Evidence validation
                validation = self.validator.validate(output, processed)
                if validation.can_publish:
                    return SummaryResult(output=output, model_route=route.id)
                else:
                    logger.warning(
                        "Validation failed, trying next route",
                        errors=validation.errors,
                        route=route.id,
                    )
                    last_error = f"Validation failed: {validation.errors}"

            except Exception as e:
                # ProviderCascade.call already records circuit-breaker state
                logger.warning("Route failed", route=route.id, error=str(e))
                last_error = str(e)
                continue

        # All routes failed
        raise RuntimeError(f"All provider routes failed. Last error: {last_error}")

    def _build_context(self, processed, window: dict) -> str:
        lines = [
            f"Periode: {window['start']} sampai {window['end']}",
            f"Jumlah pesan: {processed.stats['total']}",
            f"Jumlah pesan (setelah filter): {processed.stats['text']}",
            f"Jumlah peserta: {processed.participant_count}",
            "",
            "Percakapan:",
            processed.to_prompt_context(),
        ]
        return "\n".join(lines)


class SummaryResult:
    def __init__(self, output: SummaryOutput, model_route: str):
        self.output = output
        self.model_route = model_route
