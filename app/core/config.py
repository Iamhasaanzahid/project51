import json
import logging
import os
from typing import List, Optional
from pydantic import Field, PostgresDsn, RedisDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("aifabric.config")

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # Core Environment Configuration
    PROJECT_NAME: str = "AI Fabric & Retail SaaS Ecosystem"
    ENVIRONMENT: str = Field(default="production", description="Environment stage: production, staging, dev")
    DEBUG: bool = False
    
    # JWT Authentication & Cryptography
    SECRET_KEY: str = Field(..., description="High entropy JWT signing key")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    # AWS Credentials & Secrets Manager Integration
    AWS_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_BUCKET_NAME: str = "ai-fabric-secure-storage-prod"
    AWS_SECRETS_MANAGER_SECRET_NAME: Optional[str] = None

    # Database Settings (Multi-Tenant PostgreSQL)
    POSTGRES_USER: str = "aifabric_user"
    POSTGRES_PASSWORD: str = "SecretDBPass"
    POSTGRES_HOST: str = "postgres-db"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "aifabric_prod"
    POSTGRES_SSL_MODE: str = "verify-full"

    # Redis Rate Limiting & Celery Task Queue
    REDIS_HOST: str = "redis-cache"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: Optional[str] = None
    REDIS_SSL: bool = False

    # Financial Gateway Configurations
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None

    JAZZCASH_MERCHANT_ID: Optional[str] = None
    JAZZCASH_PASSWORD: Optional[str] = None
    JAZZCASH_INTEGER_KEY: Optional[str] = None
    JAZZCASH_WEBHOOK_SECRET: Optional[str] = None

    PAYFAST_MERCHANT_ID: Optional[str] = None
    PAYFAST_SECURED_KEY: Optional[str] = None
    PAYFAST_WEBHOOK_SECRET: Optional[str] = None

    # Allowed Subnets for Payment Gateway Webhook IP Whitelisting
    JAZZCASH_ALLOWED_IPS: str = "202.163.100.0/24,111.68.100.0/24"
    PAYFAST_ALLOWED_IPS: str = "103.228.150.0/24,203.81.200.0/24"
    STRIPE_ALLOWED_IPS: str = "54.187.174.169/32,54.187.205.235/32,54.187.216.72/32"

    # AI Compute Engine Credentials
    REPLICATE_API_TOKEN: Optional[str] = None
    RUNPOD_API_KEY: Optional[str] = None

    # Malware Sandboxing
    CLAMAV_HOST: str = "clamav-service"
    CLAMAV_PORT: int = 3310

    @property
    def sync_database_url(self) -> str:
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}?sslmode={self.POSTGRES_SSL_MODE}"

    @property
    def async_database_url(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def redis_url(self) -> str:
        scheme = "rediss" if self.REDIS_SSL else "redis"
        auth = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return f"{scheme}://{auth}{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    def fetch_aws_secrets(self) -> None:
        """Fetches runtime production secrets from AWS Secrets Manager if configured."""
        if not self.AWS_SECRETS_MANAGER_SECRET_NAME:
            return

        try:
            import boto3
            from botocore.exceptions import ClientError

            session = boto3.session.Session()
            client = session.client(
                service_name="secretsmanager",
                region_name=self.AWS_REGION,
                aws_access_key_id=self.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=self.AWS_SECRET_ACCESS_KEY,
            )
            response = client.get_secret_value(SecretId=self.AWS_SECRETS_MANAGER_SECRET_NAME)
            if "SecretString" in response:
                secrets = json.loads(response["SecretString"])
                for key, val in secrets.items():
                    if hasattr(self, key):
                        setattr(self, key, val)
                logger.info("Successfully fetched and overridden configuration from AWS Secrets Manager.")
        except Exception as e:
            logger.warning(f"Failed to fetch secrets from AWS Secrets Manager: {e}. Falling back to environment variables.")


settings = Settings()
settings.fetch_aws_secrets()
