from app.schemas.summary_output import Decision, Highlight, ImportantMessage, SummaryOutput
from app.services.preprocessor import Preprocessor
from app.services.validator import SummaryValidator


def _processed_messages():
    return Preprocessor().preprocess([
        {
            "id": 11,
            "content": "Rapat disepakati hari Jumat pukul 09.00.",
            "sender_name": "Ayu",
            "timestamp": "2026-07-21T01:00:00Z",
            "type": "text",
        },
        {
            "id": 12,
            "content": "siap",
            "sender_name": "Budi",
            "timestamp": "2026-07-21T01:01:00Z",
            "type": "text",
        },
    ])


def _output(**overrides):
    values = {
        "period": {"start": "2026-07-21T00:00:00Z", "end": "2026-07-21T12:00:00Z"},
        "activity": {"message_count": 2, "participant_count": 2},
        "narrative": "Rapat telah disepakati.",
    }
    values.update(overrides)
    return SummaryOutput(**values)


def test_preprocessor_filters_noise_and_keeps_stable_evidence_ids():
    processed = _processed_messages()
    assert processed.stats == {"total": 2, "noise": 1, "text": 1, "media": 0}
    assert processed.to_prompt_context() == (
        "[id:11] [PERSON_001] Rapat disepakati hari Jumat pukul 09.00."
    )


def test_sensitivity_redacts_without_blocking():
    from app.services.sensitivity import SensitivityScanner

    scanner = SensitivityScanner()
    text = "NIK saya 1234567890123456 dan password: rahasia123"
    redacted, result = scanner.redact(text)
    assert result.is_sensitive is True
    assert "1234567890123456" not in redacted
    assert "rahasia123" not in redacted
    assert "DISAMARKAN" in redacted


def test_preprocessor_extracts_links_and_top_senders():
    processed = Preprocessor().preprocess([
        {
            "id": 1,
            "content": "Cek proposal https://example.com/a dan www.desa.id/info",
            "sender_name": "Ayu",
            "timestamp": "2026-07-21T01:00:00Z",
            "type": "text",
        },
        {
            "id": 2,
            "content": "oke",
            "sender_name": "Budi",
            "timestamp": "2026-07-21T01:01:00Z",
            "type": "text",
        },
        {
            "id": 3,
            "content": "https://example.com/a lagi",
            "sender_name": "Ayu",
            "timestamp": "2026-07-21T01:02:00Z",
            "type": "text",
        },
    ])
    urls = [link["url"] for link in processed.links]
    assert "https://example.com/a" in urls
    assert "https://www.desa.id/info" in urls
    # duplicate URL from Ayu is de-duped
    assert urls.count("https://example.com/a") == 1
    assert processed.top_senders[0]["alias"] == "PERSON_001"
    assert processed.top_senders[0]["count"] == 2
    assert processed.alias_map["Ayu"] == "PERSON_001"



def test_validator_accepts_exact_quote_and_known_evidence():
    result = SummaryValidator().validate(
        _output(
            important_messages=[ImportantMessage(
                speaker_alias="PERSON_001",
                quote="Rapat disepakati hari Jumat",
                source_message_id=11,
            )],
            decisions=[Decision(
                text="Rapat Jumat",
                status="confirmed",
                source_message_ids=[11],
            )],
        ),
        _processed_messages(),
    )
    assert result.can_publish is True
    assert result.errors == []


def test_validator_blocks_unknown_or_missing_evidence():
    result = SummaryValidator().validate(
        _output(
            highlights=[Highlight(text="Informasi rekaan", source_message_ids=[999])],
            decisions=[Decision(text="Tanpa bukti", status="confirmed", source_message_ids=[])],
        ),
        _processed_messages(),
    )
    assert result.can_publish is False
    assert "Highlight references unknown message: 999" in result.errors
    assert "Decision has no source messages" in result.errors


def test_validator_blocks_inexact_quotes():
    result = SummaryValidator().validate(
        _output(important_messages=[ImportantMessage(
            speaker_alias="PERSON_001",
            quote="Rapat dipindah ke hari Sabtu",
            source_message_id=11,
        )]),
        _processed_messages(),
    )
    assert result.can_publish is False
    assert any("Quote not found" in error for error in result.errors)
