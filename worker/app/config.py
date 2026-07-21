from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: str = "development"
    worker_auth_token: str = ""
    gh_models_token_a: str = ""
    gh_models_token_b: str = ""
    temp_dir: str = "/data/temp"

    # GitHub Models inference (same contract as Magang-Istana)
    github_models_base_url: str = "https://models.github.ai/inference"

    # Ordered cascade models (primary → cheaper). Dual-token expansion is in ProviderCascade.
    # Pattern mirrors Magang-Istana python-ai/config/ai_config.yaml chat lane:
    # gpt-4.1 → gpt-4o → gpt-4.1-mini → gpt-4.1-nano (each token A then token B).
    summary_models: str = (
        "openai/gpt-4.1,"
        "openai/gpt-4o,"
        "openai/gpt-4.1-mini,"
        "openai/gpt-4.1-nano"
    )
    pdf_models: str = (
        "openai/gpt-4.1,"
        "openai/gpt-4o,"
        "openai/gpt-4.1-mini,"
        "openai/gpt-4.1-nano"
    )
    # Schedule detection is lighter — start from mini to save quota
    schedule_models: str = "openai/gpt-4.1-mini,openai/gpt-4.1-nano"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def model_list(self, lane: str) -> list[str]:
        raw = {
            "summary": self.summary_models,
            "pdf": self.pdf_models,
            "schedule": self.schedule_models,
        }.get(lane, "")
        return [m.strip() for m in raw.split(",") if m.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
