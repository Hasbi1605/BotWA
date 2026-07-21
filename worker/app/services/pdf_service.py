from __future__ import annotations
import json
import os
import structlog

import pdfplumber
import pytesseract

from app.services.sensitivity import SensitivityScanner

logger = structlog.get_logger()

PDF_SYSTEM_PROMPT = """Kamu menganalisis dokumen PDF/Word untuk grup KKN / komunitas desa di Indonesia.

TUJUAN: ringkasan YANG LENGKAP dan BERGUNA — bukan cuplikan super-pendek.
Anggota grup harus bisa bertindak dari ringkasan tanpa membuka ulang PDF.

ATURAN:
1. Ekstrak SEMUA keputusan, tugas, penugasan nama, tanggal/jam, pertanyaan terbuka, daftar barang.
2. Jangan mengarang. Jika tidak ada di dokumen, jangan isi.
3. Pertahankan nama orang, proker, lokasi, tanggal persis seperti dokumen.
4. Untuk daftar panjang (peralatan, belanjaan): sertakan SEMUA item; boleh digabung per kategori.
5. Untuk pembagian tugas/peralatan per orang: sebut NAMA + item.
6. Jangan kutip NIK/rekening/password (sudah disamarkan bila ada).
7. Bahasa Indonesia jelas, padat tapi lengkap.

OUTPUT JSON (isi array kosong [] jika tidak ada):
{
  "title": "judul dokumen",
  "purpose": "2-4 kalimat: apa dokumen ini & konteks",
  "sections": [
    {"heading": "nama section di dokumen", "points": ["poin detail 1", "poin detail 2"]}
  ],
  "key_points": ["poin utama lintas section — 5 s/d 12 item, spesifik"],
  "decisions": ["keputusan final, spesifik"],
  "tasks": [{"text": "tugas/item", "assignee": "nama atau null", "due": "tanggal/teks atau null"}],
  "assignments": [{"person": "nama", "items": ["item1", "item2"]}],
  "schedule": [{"when": "tanggal/jam/minggu", "what": "kegiatan"}],
  "open_questions": ["pertanyaan yang masih digantung di dokumen"],
  "shopping_list": ["barang1", "barang2"],
  "deadlines": [{"date": "YYYY-MM-DD atau teks asli", "description": "apa"}],
  "source_pages": [{"page": 1, "content": "cuplikan singkat"}]
}

WAJIB:
- sections: ikuti struktur dokumen (A, B, C… atau heading asli) bila ada.
- tasks + assignments: jangan hanya 3-4 item jika dokumen memuat puluhan penugasan.
- shopping_list / open_questions / schedule: isi jika ada di dokumen.
- key_points: minimal 5 jika dokumen kaya isi.

Balikkan HANYA JSON valid, tanpa markdown."""


class PdfService:
    def __init__(self):
        self.sensitivity_scanner = SensitivityScanner()

    async def analyze(self, request) -> dict:
        """Extract text from PDF/Word, redact sensitive data, analyze thoroughly."""
        file_path = request.file_path

        if not os.path.exists(file_path):
            return {"error": "File not found", "status": "error"}

        try:
            extracted_text, page_count = self._extract_text(file_path)

            if not extracted_text.strip():
                return {
                    "status": "unprocessable",
                    "error": "No text could be extracted from document",
                }

            safe_text, sensitivity_result = self.sensitivity_scanner.redact(extracted_text)

            analysis = await self._analyze_with_ai(
                safe_text,
                {
                    **(request.metadata or {}),
                    "page_count": page_count or (request.metadata or {}).get("page_count"),
                },
            )
            if isinstance(analysis, dict) and analysis.get("error"):
                return {"status": "error", "error": analysis["error"]}

            if isinstance(analysis, dict):
                analysis["redacted"] = sensitivity_result.is_sensitive
                if sensitivity_result.is_sensitive:
                    analysis["sensitivity_note"] = sensitivity_result.summary

            return {
                "status": "analyzed",
                "page_count": page_count,
                "analysis": analysis,
                "redacted": sensitivity_result.is_sensitive,
            }

        except Exception as e:
            logger.error("Document processing failed", error=str(e), document_id=request.document_id)
            return {"status": "error", "error": str(e)}

    def _extract_text(self, file_path: str) -> tuple[str, int]:
        lower = file_path.lower()
        if lower.endswith(".docx") or lower.endswith(".doc"):
            return self._extract_word(file_path)
        return self._extract_pdf(file_path)

    def _extract_word(self, file_path: str) -> tuple[str, int]:
        try:
            from docx import Document  # type: ignore

            doc = Document(file_path)
            parts = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    cells = [c.text.strip() for c in row.cells if c.text and c.text.strip()]
                    if cells:
                        parts.append(" | ".join(cells))
            text = "\n".join(parts)
            return text, max(1, len(parts) // 40 or 1)
        except ImportError:
            logger.error("python-docx not installed")
            raise RuntimeError("Word support requires python-docx")
        except Exception as e:
            logger.error("Word extraction failed", error=str(e))
            raise

    def _extract_pdf(self, file_path: str) -> tuple[str, int]:
        text_parts = []
        page_count = 0

        try:
            with pdfplumber.open(file_path) as pdf:
                page_count = len(pdf.pages)
                for i, page in enumerate(pdf.pages):
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(f"[Halaman {i+1}]\n{page_text}")
                    else:
                        try:
                            ocr_text = self._ocr_page(page)
                            if ocr_text:
                                text_parts.append(f"[Halaman {i+1} (OCR)]\n{ocr_text}")
                        except Exception as e:
                            logger.warning(f"OCR failed for page {i+1}", error=str(e))
        except Exception as e:
            logger.error("PDF extraction failed", error=str(e))
            raise

        return "\n\n".join(text_parts), page_count

    def _ocr_page(self, page) -> str:
        try:
            image = page.to_image(resolution=300)
            pil_image = image.original
            text = pytesseract.image_to_string(pil_image, lang="ind+eng")
            return text.strip()
        except Exception as e:
            logger.warning("OCR failed", error=str(e))
            return ""

    async def _analyze_with_ai(self, text: str, metadata: dict) -> dict:
        from app.providers.cascade import ProviderCascade

        # Keep nearly full short/medium docs; only hard-cap huge files
        max_chars = 80_000
        if len(text) > max_chars:
            text = text[:max_chars] + "\n\n[Dokumen dipotong karena terlalu panjang — prioritaskan bagian awal & daftar penugasan]"

        user_content = (
            f"Dokumen: {metadata.get('filename', 'unknown')}\n"
            f"Jumlah halaman: {metadata.get('page_count') or '?'}\n"
            f"Panjang teks: {len(text)} karakter\n\n"
            "Instruksi tambahan: ekstrak sedetail mungkin. "
            "Jika ada daftar peralatan per orang, timeline, pertanyaan survei, "
            "rundown mingguan, atau daftar belanja — JANGAN dihilangkan.\n\n"
            f"Isi dokumen:\n{text}"
        )

        cascade = ProviderCascade()
        for route in cascade.get_routes("pdf"):
            try:
                result = await cascade.call(
                    route=route,
                    system_prompt=PDF_SYSTEM_PROMPT,
                    user_content=user_content,
                    response_format={"type": "json_object"},
                )
                return json.loads(result.content)
            except Exception as e:
                logger.warning("PDF route failed", route=route.id, error=str(e))
                continue

        return {"error": "All provider routes failed for PDF analysis"}
