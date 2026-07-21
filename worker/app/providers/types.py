from __future__ import annotations
from dataclasses import dataclass


@dataclass
class ProviderRoute:
    id: str
    account_alias: str
    model_id: str
    token: str
    base_url: str = "https://models.inference.ai.azure.com"


@dataclass
class ProviderResult:
    content: str
    model: str
    usage: dict


@dataclass
class CircuitBreakerState:
    state: str = "healthy"
    cooldown_until: str | None = None
    consecutive_errors: int = 0
    last_error_class: str | None = None
