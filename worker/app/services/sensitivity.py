from __future__ import annotations

import re
from dataclasses import dataclass

import structlog

logger = structlog.get_logger()

# Patterns for sensitive data
SENSITIVE_PATTERNS = [
    (r"\b\d{16}\b", "NIK/KTP"),
    (r"\b\d{10,16}\b", "Nomor rekening"),
    (r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b", "Nomor kartu"),
    (r"(?i)(password|passwd|pwd|secret|token|api.?key)\s*[:=]\s*\S+", "Kredensial"),
    (r"(?i)tanda\s*tangan", "Tanda tangan"),
    (r"(?i)(diagnosa|diagnosis|riwayat\s+penyakit|hasil\s+lab)", "Data kesehatan"),
    (r"\b[A-Z]{2}\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b", "Nomor NPWP"),
]


@dataclass
class SensitivityFinding:
    pattern: str
    count: int


@dataclass
class SensitivityResult:
    is_sensitive: bool
    findings: list[SensitivityFinding]
    summary: str


class SensitivityScanner:
    """Scans document text for sensitive data patterns; redacts instead of blocking."""

    def scan(self, text: str) -> SensitivityResult:
        findings = []
        for pattern, label in SENSITIVE_PATTERNS:
            matches = re.findall(pattern, text)
            if matches:
                findings.append(
                    SensitivityFinding(
                        pattern=label,
                        count=len(matches),
                        # Don't include actual matched values in findings
                    )
                )

        is_sensitive = len(findings) > 0
        return SensitivityResult(
            is_sensitive=is_sensitive,
            findings=findings,
            summary=(
                f"Ditemukan {len(findings)} pola data sensitif (disamarkan)"
                if is_sensitive
                else "Tidak ada data sensitif terdeteksi"
            ),
        )

    def redact(self, text: str) -> tuple[str, SensitivityResult]:
        """Return text with sensitive spans replaced by [DISAMARKAN: label]."""
        result = self.scan(text)
        redacted = text
        for pattern, label in SENSITIVE_PATTERNS:
            redacted = re.sub(pattern, f"[DISAMARKAN:{label}]", redacted)
        return redacted, result
