from __future__ import annotations
import os
import structlog
from typing import Any

import pdfplumber
from PIL import Image
import pytesseract

from app.config import get_settings
from app.services.sensitivity import SensitivityScanner

logger = structlog.get_logger()


class PdfService:
    def __init__(self):
        self.sensitivity_scanner = SensitivityScanner()

    async def analyze(self, request) -> dict:
        """Extract text from PDF, check sensitivity, and analyze content."""
        settings = get_settings()
        file_path = request.file_path

        if not os.path.exists(file_path):
            return {"error": "File not found", "status": "error"}

        try:
            # Extract text
            extracted_text, page_count = self._extract_text(file_path)

            if not extracted_text.strip():
                return {
                    "status": "unprocessable",
                    "error": "No text could be extracted from PDF",
                }

            # Sensitivity check
            sensitivity_result = self.sensitivity_scanner.scan(extracted_text)
            if sensitivity_result.is_sensitive:
                return {
                    "status": "held",
                    "reason": "sensitive_data",
                    "summary": sensitivity_result.summary,
                    "findings": [f.pattern for f in sensitivity_result.findings],
                }

            # Analyze with AI
            analysis = await self._analyze_with_ai(extracted_text, request.metadata)

            return {
                "status": "analyzed",
                "page_count": page_count,
                "analysis": analysis,
            }

        except Exception as e:
            logger.error("PDF processing failed", error=str(e), document_id=request.document_id)
            return {"status": "error", "error": str(e)}

    def _extract_text(self, file_path: str) -> tuple[str, int]:
        """Extract text from PDF using pdfplumber."""
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
                        # Try OCR for scanned pages
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
        """OCR a single page using Tesseract."""
        try:
            image = page.to_image(resolution=300)
            pil_image = image.original
            text = pytesseract.image_to_string(pil_image, lang="ind+eng")
            return text.strip()
        except Exception as e:
            logger.warning("OCR failed", error=str(e))
            return ""

    async def _analyze_with_ai(self, text: str, metadata: dict) -> dict:
        """Analyze extracted text with AI provider."""
        from app.providers.cascade import ProviderCascade

        system_prompt = """Analisis dokumen PDF berikut dan ekstrak informasi penting.

OUTPUT FORMAT (JSON):
{
  "title": "judul dokumen",
  "purpose": "tujuan dokumen",
  "key_points": ["poin 1", "poin 2"],
  "decisions": ["keputusan 1"],
  "tasks": [{"text": "tugas", "assignee": "nama|null", "due": "tanggal|null"}],
  "deadlines": [{"date": "YYYY-MM-DD", "description": "deskripsi"}],
  "source_pages": [{"page": 1, "content": "referensi halaman"}]
}

Balikkan HANYA JSON, tanpa markdown code block."""

        # Truncate text if too long
        max_chars = 50000
        if len(text) > max_chars:
            text = text[:max_chars] + "\n\n[Dokumen dipotong karena terlalu panjang]"

        user_content = f"Dokumen: {metadata.get('filename', 'unknown')}\n"
        if metadata.get("page_count"):
            user_content += f"Jumlah halaman: {metadata['page_count']}\n"
        user_content += f"\nIsi dokumen:\n{text}"

        cascade = ProviderCascade()
        for route in cascade.get_routes("pdf"):
            try:
                result = await cascade.call(
                    route=route,
                    system_prompt=system_prompt,
                    user_content=user_content,
                    response_format={"type": "json_object"},
                )
                import json
                return json.loads(result.content)
            except Exception as e:
                logger.warning("PDF route failed", route=route.id, error=str(e))
                cascade.record_error(route, e)
                continue

        return {"error": "All provider routes failed for PDF analysis"}
