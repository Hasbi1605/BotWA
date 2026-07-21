from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: str = "development"
    worker_auth_token: str = ""
    gh_models_token_a: str = ""
    gh_models_token_b: str = ""
    temp_dir: str = "/data/temp"

    # Provider settings
    summary_model_primary: str = "gpt-4.1-mini"
    summary_model_fallback: str = "gpt-4.1-nano"
    pdf_model_primary: str = "gpt-4.1"
    pdf_model_fallback: str = "gpt-4o"
    schedule_model: str = "gpt-4.1-nano"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
