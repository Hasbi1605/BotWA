from datetime import UTC, datetime

import pytest

from app.providers.cascade import ProviderCascade, ProviderRoute
from app.schemas.requests import ScheduleDetectRequest
from app.services.schedule_parser import ScheduleParser
from app.services.sensitivity import SensitivityScanner


@pytest.mark.asyncio
async def test_schedule_parser_prefers_explicit_date_and_time_without_ai(monkeypatch):
    parser = ScheduleParser()

    async def unexpected_ai(_request):
        raise AssertionError("AI fallback must not run for an unambiguous schedule")

    monkeypatch.setattr(parser, "_detect_with_ai", unexpected_ai)
    request = ScheduleDetectRequest(
        group_id=1,
        reference_time="2026-07-21T00:00:00Z",
        messages=[{
            "id": 7,
            "content": "Rapat 25-07-2026 jam 09:30 di balai desa",
            "sender_name": "Ayu",
            "timestamp": "2026-07-21T00:00:00Z",
        }],
    )

    candidates = await parser.detect(request)
    assert len(candidates) == 1
    assert candidates[0]["date"] == "2026-07-25"
    assert candidates[0]["time"] == "09:30"
    assert candidates[0]["source_message_ids"] == [7]


def test_sensitivity_scanner_reports_categories_without_leaking_values():
    text = "NIK warga 1234567890123456 dan password: sangat-rahasia"
    result = SensitivityScanner().scan(text)

    assert result.is_sensitive is True
    assert {finding.pattern for finding in result.findings} >= {"NIK/KTP", "Kredensial"}
    assert "1234567890123456" not in result.summary
    assert "sangat-rahasia" not in result.summary


class ProviderError(Exception):
    def __init__(self, status_code):
        self.status_code = status_code
        super().__init__(f"provider status {status_code}")


def test_provider_circuit_breaker_disables_auth_failure_and_cools_rate_limit():
    cascade = ProviderCascade()
    auth_route = ProviderRoute("auth", "a", "model", "token")
    rate_route = ProviderRoute("rate", "a", "model", "token")

    cascade.record_error(auth_route, ProviderError(401))
    cascade.record_error(rate_route, ProviderError(429))

    assert cascade.circuit_breakers["auth"].state == "disabled"
    assert cascade.circuit_breakers["rate"].state == "cooldown"
    assert cascade.circuit_breakers["rate"].cooldown_until > datetime.now(UTC)
