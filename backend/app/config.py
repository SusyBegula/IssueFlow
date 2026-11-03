from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[1] / ".env", extra="ignore")
    database_url: SecretStr = SecretStr("")
    database_schema: str = Field(default="public", pattern=r"^[a-z][a-z0-9_]{0,62}$")
    auth_username: str = "susybegula"
    auth_password_hash: SecretStr = SecretStr("")
    session_hours: int = 12
    cookie_secure: bool = False
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    render_external_url: str = ""

    @property
    def allowed_origins(self) -> list[str]:
        origins = list(self.cors_origins)
        if self.render_external_url:
            origins.append(self.render_external_url.rstrip("/"))
        return origins


@lru_cache
def settings() -> Settings:
    return Settings()
