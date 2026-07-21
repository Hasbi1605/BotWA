from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Optional

import structlog
from openai import AsyncOpenAI

from app.config import get_settings

logger = structlog.get_logger()


@dataclass
class ProviderRoute:
    id: str
    account_alias: str
    model_id: str
    token: str
    base_url: str = "https://models.github.ai/inference"


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
    """GitHub Models cascade with dual-token fallback (Magang-Istana style).

    For each model in the lane list, try token A then token B before moving to the
    next (cheaper) model:

        gpt-4.1 / token_a
        gpt-4.1 / token_b
        gpt-4o  / token_a
        gpt-4o  / token_b
        mini    / token_a
        mini    / token_b
        nano    / token_a
        nano    / token_b
    """

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.github_models_base_url.rstrip("/")
        self.routes = self._build_routes(settings)
        self.circuit_breakers: dict[str, CircuitBreakerState] = {}

    def _build_routes(self, settings) -> dict[str, list[ProviderRoute]]:
        token_pairs = [
            ("token_a", settings.gh_models_token_a),
            ("token_b", settings.gh_models_token_b),
        ]
        # Drop empty tokens so a missing secondary key still works with one account
        token_pairs = [(alias, tok) for alias, tok in token_pairs if tok]

        built: dict[str, list[ProviderRoute]] = {}
        for lane in ("summary", "pdf", "schedule", "chat"):
            models = settings.model_list(lane)
            lane_routes: list[ProviderRoute] = []
            for model_id in models:
                short = model_id.split("/")[-1].replace(".", "").replace("-", "")
                for alias, token in token_pairs:
                    lane_routes.append(
                        ProviderRoute(
                            id=f"{lane}-{short}-{alias[-1]}",
                            account_alias=alias,
                            model_id=model_id,
                            token=token,
                            base_url=self.base_url,
                        )
                    )
            built[lane] = lane_routes
        return built

    def get_routes(self, lane: str) -> list[ProviderRoute]:
        """Get available routes for a lane, skipping those in cooldown/disabled."""
        routes = self.routes.get(lane, [])
        available: list[ProviderRoute] = []
        now = datetime.now(UTC)

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
            kwargs: dict[str, Any] = {
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
            retry_after = getattr(error, "retry_after", None)
            if retry_after:
                cb.cooldown_until = datetime.now(UTC) + timedelta(seconds=retry_after)
            else:
                cb.cooldown_until = datetime.now(UTC) + timedelta(minutes=30)
            cb.state = "cooldown"
        elif error_class == "auth":
            cb.state = "disabled"
        elif error_class in ("server_error", "timeout"):
            cb.cooldown_until = datetime.now(UTC) + timedelta(minutes=5)
            cb.state = "cooldown"
        else:
            cb.cooldown_until = datetime.now(UTC) + timedelta(minutes=5)
            cb.state = "cooldown"

        self.circuit_breakers[route.id] = cb
        logger.warning(
            "Provider error recorded",
            route=route.id,
            model=route.model_id,
            account=route.account_alias,
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
