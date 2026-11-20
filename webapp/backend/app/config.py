"""Central application configuration loaded from environment variables.

All thresholds that influence the Quality Gate are defined here so they can be
overridden by the deployment environment and (for quality thresholds) at
runtime by an administrator through ``/api/v1/config/quality``.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings. Environment variables always take precedence."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ------------------------------------------------------------------
    # Database
    # ------------------------------------------------------------------
    POSTGRES_USER: str = "eye_tracker"
    POSTGRES_PASSWORD: str = "change_me"
    POSTGRES_DB: str = "eye_tracker"
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    # When unset, the URL is assembled from the POSTGRES_* variables above.
    DATABASE_URL: str | None = None

    # ------------------------------------------------------------------
    # Security
    # ------------------------------------------------------------------
    JWT_SECRET: str = "change_this_to_a_long_random_secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ------------------------------------------------------------------
    # Application
    # ------------------------------------------------------------------
    APP_VERSION: str = "1.0.0"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    ARTIFACTS_DIR: str = "artifacts"

    # Seed credentials (used only when the database has no admin user).
    ADMIN_EMAIL: str = "admin@example.com"
    ADMIN_PASSWORD: str = "change_me"
    ADMIN_NAME: str = "System Administrator"
    DEFAULT_CLINIC_NAME: str = "Default Clinic"
    DEFAULT_CLINIC_CODE: str = "DEFAULT"

    # ------------------------------------------------------------------
    # Quality Gate defaults (all overridable at runtime by an admin)
    # ------------------------------------------------------------------
    MIN_VALID_GAZE_RATIO: float = 0.70
    MAX_TRACKING_GAP_SEC: float = 0.75
    BRIGHTNESS_MIN: float = 25.0
    BRIGHTNESS_MAX: float = 235.0
    MAX_CALIBRATION_ERROR_PX: float = 180.0

    # ------------------------------------------------------------------
    # Acquisition protocol
    # ------------------------------------------------------------------
    STIMULUS_TARGET: int = 10
    STIMULUS_DURATION_SEC: float = 10.0

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _normalise_origins(cls, value: object) -> str:
        """Accept either a comma-separated string or a JSON-like list."""
        if isinstance(value, (list, tuple, set)):
            return ",".join(str(item).strip() for item in value if str(item).strip())
        if isinstance(value, str):
            return ",".join(part.strip() for part in value.split(",") if part.strip())
        return value

    @property
    def cors_origins_list(self) -> list[str]:
        """Return CORS origins as a concrete list for Starlette."""
        return [part.strip() for part in self.CORS_ORIGINS.split(",") if part.strip()]

    @property
    def sql_database_url(self) -> str:
        """Effective SQLAlchemy URL (explicit DATABASE_URL wins)."""
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def artifacts_path(self) -> Path:
        """Absolute path to persisted model artifacts."""
        path = Path(self.ARTIFACTS_DIR)
        if not path.is_absolute():
            path = Path(__file__).resolve().parent.parent / path
        return path


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (env is read once per process)."""
    return Settings()


settings = get_settings()
