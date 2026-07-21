from __future__ import annotations
import os
import json
import time
import structlog
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Optional

from openai import AsyncOpenAI
from app.config import get_settings

logger = structlog.get_logger()


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
    usage: dict = field(default_factory=dict)


@dataclass
class CircuitBreakerState:
    state: str = "healthy"  # healthy, cooldown, disabled
    cooldown_until: Optional[datetime] = None
    consecutive_errors: int = 0
    last_error_class: Optional[str] = None


class ProviderCascade:
    """Manages AI provider routes with circuit breaker and fallback."""

    def __init__(self):
        settings = get_settings()
        self.routes = self._build_routes(settings)
        self.circuit_breakers: dict[str, CircuitBreakerState] = {}

    def _build_routes(self, settings) -> dict[str, list[ProviderRoute]]:
        """Build provider routes per lane."""
        routes = {
            "summary": [
                ProviderRoute(
                    id="summary-mini-a",
                    account_alias="token_a",
                    model_id=settings.summary_model_primary,
                    token=settings.gh_models_token_a,
                ),
                ProviderRoute(
                    id="summary-mini-b",
                    account_alias="token_b",
                    model_id=settings.summary_model_primary,
                    token=settings.gh_models_token_b,
                ),
                ProviderRoute(
                    id="summary-nano-a",
                    account_alias="token_a",
                    model_id=settings.summary_model_fallback,
                    token=settings.gh_models_token_a,
                ),
                ProviderRoute(
                    id="summary-nano-b",
                    account_alias="token_b",
                    model_id=settings.summary_model_fallback,
                    token=settings.gh_models_token_b,
                ),
            ],
            "pdf": [
                ProviderRoute(
                    id="pdf-gpt41-a",
                    account_alias="token_a",
                    model_id=settings.pdf_model_primary,
                    token=settings.gh_models_token_a,
                ),
                ProviderRoute(
                    id="pdf-gpt41-b",
                    account_alias="token_b",
                    model_id=settings.pdf_model_primary,
                    token=settings.gh_models_token_b,
                ),
                ProviderRoute(
                    id="pdf-gpt4o-a",
                    account_alias="token_a",
                    model_id=settings.pdf_model_fallback,
                    token=settings.gh_models_token_a,
                ),
                ProviderRoute(
                    id="pdf-gpt4o-b",
                    account_alias="token_b",
                    model_id=settings.pdf_model_fallback,
                    token=settings.gh_models_token_b,
                ),
            ],
            "schedule": [
                ProviderRoute(
                    id="schedule-nano-a",
                    account_alias="token_a",
                    model_id=settings.schedule_model,
                    token=settings.gh_models_token_a,
                ),
                ProviderRoute(
                    id="schedule-nano-b",
                    account_alias="token_b",
                    model_id=settings.schedule_model,
                    token=settings.gh_models_token_b,
                ),
            ],
        }
        return routes

    def get_routes(self, lane: str) -> list[ProviderRoute]:
        """Get available routes for a lane, skipping those in cooldown."""
        routes = self.routes.get(lane, [])
        available = []
        now = datetime.utcnow()

        for route in routes:
            cb = self.circuit_breakers.get(route.id, CircuitBreakerState())

            if cb.state == "disabled":
                continue
            if cb.state == "cooldown" and cb.cooldown_until and now < cb.cooldown_until:
                continue

            available.append(route)

        return available

    async def call(
        self,
        route: ProviderRoute,
        system_prompt: str,
        user_content: str,
        response_format: Optional[dict] = None,
    ) -> ProviderResult:
        """Call a provider route."""
        client = AsyncOpenAI(
            api_key=route.token,
            base_url=route.base_url,
            timeout=60.0,
        )

        try:
            kwargs = {
                "model": route.model_id,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                "temperature": 0.3,
                "max_tokens": 4000,
            }

            if response_format:
                kwargs["response_format"] = response_format

            response = await client.chat.completions.create(**kwargs)

            content = response.choices[0].message.content or ""
            usage = {
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
            }

            # Reset circuit breaker on success
            self.circuit_breakers[route.id] = CircuitBreakerState()

            return ProviderResult(content=content, model=route.model_id, usage=usage)

        except Exception as e:
            self.record_error(route, e)
            raise

    def record_error(self, route: ProviderRoute, error: Any):
        """Record an error and update circuit breaker state."""
        cb = self.circuit_breakers.get(route.id, CircuitBreakerState())
        cb.consecutive_errors += 1

        error_class = self._classify_error(error)
        cb.last_error_class = error_class

        if error_class == "rate_limit":
            # 429: cooldown 30 minutes
            retry_after = getattr(error, "retry_after", None)
            if retry_after:
                cb.cooldown_until = datetime.utcnow() + timedelta(seconds=retry_after)
            else:
                cb.cooldown_until = datetime.utcnow() + timedelta(minutes=30)
            cb.state = "cooldown"
        elif error_class == "auth":
            # 401/403: disabled until manual fix
            cb.state = "disabled"
        elif error_class in ("server_error", "timeout"):
            # 5xx/timeout: cooldown 5 minutes
            cb.cooldown_until = datetime.utcnow() + timedelta(minutes=5)
            cb.state = "cooldown"
        else:
            # Other errors: cooldown 5 minutes
            cb.cooldown_until = datetime.utcnow() + timedelta(minutes=5)
            cb.state = "cooldown"

        self.circuit_breakers[route.id] = cb
        logger.warning(
            "Provider error recorded",
            route=route.id,
            error_class=error_class,
            state=cb.state,
            consecutive_errors=cb.consecutive_errors,
        )

    def _classify_error(self, error: Any) -> str:
        error_str = str(error).lower()

        if hasattr(error, "status_code"):
            status = error.status_code
            if status == 429:
                return "rate_limit"
            if status in (401, 403):
                return "auth"
            if status == 413:
                return "payload_too_large"
            if status >= 500:
                return "server_error"

        if "timeout" in error_str or "timed out" in error_str:
            return "timeout"
        if "rate" in error_str or "429" in error_str:
            return "rate_limit"

        return "unknown"
