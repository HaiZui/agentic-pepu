from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env"

FOUNDRY_VARIABLES = (
    "FOUNDRY_API_KEY",
    "FOUNDRY_API_ENDPOINT",
    "FOUNDRY_LLM_DEPLOYMENT_NAME",
)


class Settings(BaseSettings):
    """Settings from the process environment, falling back to `.env` (environment wins)."""

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
        populate_by_name=True,
    )

    foundry_api_key: SecretStr | None = Field(default=None, validation_alias="FOUNDRY_API_KEY")
    foundry_api_endpoint: str | None = Field(default=None, validation_alias="FOUNDRY_API_ENDPOINT")
    foundry_llm_deployment_name: str | None = Field(
        default=None, validation_alias="FOUNDRY_LLM_DEPLOYMENT_NAME"
    )
    host: str = Field(default="127.0.0.1", validation_alias="BOTTLE_THRONE_HOST")
    port: int = Field(default=8765, ge=1, le=65535, validation_alias="BOTTLE_THRONE_PORT")

    def foundry_presence(self) -> dict[str, bool]:
        return {
            "FOUNDRY_API_KEY": self.foundry_api_key is not None
            and bool(self.foundry_api_key.get_secret_value()),
            "FOUNDRY_API_ENDPOINT": bool(self.foundry_api_endpoint),
            "FOUNDRY_LLM_DEPLOYMENT_NAME": bool(self.foundry_llm_deployment_name),
        }

    def missing_foundry_variables(self) -> list[str]:
        return [name for name, present in self.foundry_presence().items() if not present]

    def secret_values(self) -> list[str]:
        if self.foundry_api_key is None:
            return []
        value = self.foundry_api_key.get_secret_value()
        return [value] if value else []


@lru_cache
def get_settings() -> Settings:
    return Settings()
