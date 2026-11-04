"""Runtime configuration. Every value comes from the environment or `.env`."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    roomset_env: Literal["dev", "test", "prod"] = "dev"
    frontend_dist: str = "../frontend/dist"

    database_url: str = "sqlite:///./data/roomset.db"

    storage_backend: Literal["local", "s3"] = "local"
    local_storage_dir: str = "./data/artifacts"
    s3_endpoint_url: str = ""
    s3_bucket: str = "roomset"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_region: str = "auto"

    baseten_api: str = ""
    baseten_base_url: str = "https://inference.baseten.co/v1"
    baseten_model: str = "meta-models/muse-spark-open-1026"
    muse_api: str = ""
    meta_base_url: str = "https://api.meta.ai/v1"
    muse_image_model: str = "muse-image-1.0"
    assemblyai_api: str = ""
    assemblyai_base_url: str = "https://api.assemblyai.com"
    speech_timeout_s: float = 40.0

    # Spending guard for every paid model, across restarts. See app/core/budget.py.
    spend_limit_usd: float = Field(default=10.0, ge=0)
    budget_file: str = "./data/spend.json"
    daily_spark_calls: int = Field(default=200, ge=0)
    daily_speech_calls: int = Field(default=150, ge=0)
    daily_image_calls: int = Field(default=40, ge=0)

    scene_builder: Literal["local", "modal"] = "local"
    modal_app_name: str = "roomset-worker"
    reconstruction_enabled: bool = False
    reconstruction_daily_limit: int = Field(default=3, ge=0, le=20)
    reconstruction_usage_file: str = "./data/reconstruction-usage.json"

    max_concurrent_jobs: int = Field(default=2, ge=1, le=8)
    max_renders_per_session: int = Field(default=10, ge=0)
    max_sessions_per_minute: int = Field(default=10, ge=1)
    max_requests_per_minute: int = Field(default=240, ge=1)
    retention_days: int = Field(default=7, ge=1)

    max_upload_bytes: int = 10 * 1024 * 1024
    max_photos: int = 6
    min_photos: int = 3
    provider_timeout_s: float = 90.0

    @property
    def spark_enabled(self) -> bool:
        return bool(self.baseten_api)

    @property
    def image_enabled(self) -> bool:
        return bool(self.muse_api)

    @property
    def assistant_enabled(self) -> bool:
        return bool(self.assemblyai_api and self.baseten_api)


@lru_cache
def get_settings() -> Settings:
    return Settings()
