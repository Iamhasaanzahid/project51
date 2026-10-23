"""
Central configuration.

Secrets are NEVER hardcoded. They are loaded from the process environment
(12-factor) and optionally overridden at runtime from AWS Secrets Manager.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("aifabric.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # ------------------------------------------------------------------ app
    PROJECT_NAME: str = "AI Fabric & Retail SaaS Ecosystem"
    ENVIRONMENT: str = "production"          # production | staging | development
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    ALLOWED_HOSTS: str = "aifabric.retail,app.aifabric.retail"

    # ---------------------------------------------------------------- auth
    SECRET_KEY: str = Field(..., min_length=32)
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "aifabric-auth"
    JWT_AUDIENCE: str = "aifabric-api"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15     # short-lived access tokens
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ---------------------------------------------------------------- cors
    ALLOWED_ORIGINS: str = "https://aifabric.retail,https://app.aifabric.retail"

    # ----------------------------------------------------------- aws / s3
    AWS_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    AWS_S3_BUCKET_NAME: str = "ai-fabric-secure-storage-prod"
    AWS_S3_KMS_KEY_ID: str | None = None
    AWS_SECRETS_MANAGER_SECRET_NAME: str | None = None
    PRESIGNED_URL_TTL_SECONDS: int = 900      # 15 minutes, non-negotiable

    # ------------------------------------------------------------- postgres
    POSTGRES_USER: str = "aifabric_user"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_HOST: str = "postgres-db"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "aifabric_prod"
    POSTGRES_SSL_MODE: str = "verify-full"
    POSTGRES_SSL_CA_FILE: str | None = None
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # ---------------------------------------------------------------- redis
    REDIS_HOST: str = "redis-cache"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str | None = None
    REDIS_SSL: bool = False
    IDEMPOTENCY_TTL_SECONDS: int = 86_400        # 24h replay window

    # -------------------------------------------------------------- stripe
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    STRIPE_API_VERSION: str = "2024-06-20"
    STRIPE_PRICE_RENDER_PACK: str | None = None       # price_xxx
    STRIPE_PRICE_SAAS_MONTHLY: str | None = None
    STRIPE_PRICE_SAAS_ANNUAL: str | None = None

    # ------------------------------------------------------------ jazzcash
    JAZZCASH_MERCHANT_ID: str | None = None
    JAZZCASH_PASSWORD: str | None = None
    JAZZCASH_INTEGER_KEY: str | None = None
    JAZZCASH_WEBHOOK_SECRET: str | None = None
    JAZZCASH_API_URL: str = "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction"

    # ------------------------------------------------------------- payfast
    PAYFAST_MERCHANT_ID: str | None = None
    PAYFAST_SECURED_KEY: str | None = None
    PAYFAST_WEBHOOK_SECRET: str | None = None
    PAYFAST_API_URL: str = "https://ipg1.apps.net.pk/Ecommerce/api/Transaction/GetAccessToken"

    # ------------------------------------ payment processor IP allow-lists
    JAZZCASH_ALLOWED_IPS: str = "202.163.100.0/24,111.68.100.0/24"
    PAYFAST_ALLOWED_IPS: str = "103.228.150.0/24,203.81.200.0/24"
    STRIPE_ALLOWED_IPS: str = (
        "3.18.12.63/32,3.130.192.231/32,13.235.14.237/32,"
        "13.235.122.149/32,18.211.135.69/32,35.154.171.200/32,"
        "52.15.183.38/32,54.88.130.119/32,54.88.130.237/32,"
        "54.187.174.169/32,54.187.205.235/32,54.187.216.72/32"
    )

    # ------------------------------------------------------------ ai engine
    REPLICATE_API_TOKEN: str | None = None
    RUNPOD_API_KEY: str | None = None
    GPU_QUEUE_NAME: str = "gpu_render"
    CPU_QUEUE_NAME: str = "cpu_media"
    RENDER_BUCKET_CAPACITY: int = 10
    RENDER_LEAK_RATE_PER_SEC: float = 0.5
    SDXL_MODEL_ID: str = "stabilityai/stable-diffusion-xl-base-1.0"
    CONTROLNET_MODEL_ID: str = "diffusers/controlnet-canny-sdxl-1.0"
    VAE_MODEL_ID: str = "madebyollin/sdxl-vae-fp16-fix"
    RENDER_MAX_STEPS: int = 40
    RENDER_MAX_PROMPT_CHARS: int = 2000

    # -------------------------------------------------------------- clamav
    CLAMAV_HOST: str = "clamav-service"
    CLAMAV_PORT: int = 3310
    CLAMAV_TIMEOUT_SECONDS: float = 30.0
    CLAMAV_FAIL_CLOSED: bool = True          # production: reject if scanner down

    # ------------------------------------------------- field-level crypto
    # base64-encoded 32-byte key for AES-256-GCM column encryption.
    FIELD_ENCRYPTION_KEY: str | None = None

    # --------------------------------------------------------------- email
    METRICS_ENABLED: bool = True

    @field_validator("ENVIRONMENT")
    @classmethod
    def _validate_env(cls, v: str) -> str:
        if v not in {"production", "staging", "development"}:
            raise ValueError("ENVIRONMENT must be production|staging|development")
        return v

    # ------------------------------------------------------------- helpers
    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.ALLOWED_HOSTS.split(",") if h.strip()]

    @property
    def sync_database_url(self) -> str:
        cafile = f"&sslrootcert={self.POSTGRES_SSL_CA_FILE}" if self.POSTGRES_SSL_CA_FILE else ""
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            f"?sslmode={self.POSTGRES_SSL_MODE}{cafile}"
        )

    @property
    def async_database_url(self) -> str:
        # TLS is supplied to asyncpg via an explicit SSLContext in database.py.
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def redis_url(self) -> str:
        scheme = "rediss" if self.REDIS_SSL else "redis"
        auth = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return f"{scheme}://{auth}{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    # ------------------------------------------------------ secret loading
    def fetch_aws_secrets(self) -> None:
        """Pull the production secret bundle from AWS Secrets Manager, if configured."""
        if not self.AWS_SECRETS_MANAGER_SECRET_NAME:
            return
        try:
            import boto3
            from botocore.exceptions import ClientError

            client = boto3.client(
                "secretsmanager",
                region_name=self.AWS_REGION,
                aws_access_key_id=self.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=self.AWS_SECRET_ACCESS_KEY,
            )
            response = client.get_secret_value(SecretId=self.AWS_SECRETS_MANAGER_SECRET_NAME)
            if "SecretString" in response:
                for key, value in json.loads(response["SecretString"]).items():
                    if hasattr(self, key):
                        setattr(self, key, value)
                logger.info("Configuration overridden from AWS Secrets Manager.")
        except (ClientError, ValueError, KeyError) as exc:  # pragma: no cover
            logger.warning("AWS Secrets Manager unavailable (%s); using environment values.", exc)

    def assert_production_ready(self) -> None:
        """Fail fast if a production deployment is missing critical secrets."""
        if self.ENVIRONMENT != "production":
            return
        required = {
            "SECRET_KEY": self.SECRET_KEY,
            "POSTGRES_PASSWORD": self.POSTGRES_PASSWORD,
            "REDIS_PASSWORD": self.REDIS_PASSWORD,
            "STRIPE_SECRET_KEY": self.STRIPE_SECRET_KEY,
            "STRIPE_WEBHOOK_SECRET": self.STRIPE_WEBHOOK_SECRET,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise RuntimeError(f"Missing required production secrets: {', '.join(sorted(missing))}")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.fetch_aws_secrets()
    s.assert_production_ready()
    return s


settings = get_settings()
