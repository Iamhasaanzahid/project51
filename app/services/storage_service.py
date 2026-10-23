"""
S3 storage with server-side encryption and short-lived presigned URLs.

* All objects are encrypted with SSE-KMS (AWS-managed or tenant CMK).
* Public ACLs are never used; buckets are private with Block Public Access.
* Preview/download URLs expire in 15 minutes and are scoped to a single object.
"""
from __future__ import annotations

import logging
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger("aifabric.storage")


class StorageService:
    def __init__(self) -> None:
        self.bucket = settings.AWS_S3_BUCKET_NAME
        self.client = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
        )

    # ------------------------------------------------------------------ keys
    @staticmethod
    def quarantine_key(tenant_id: str, filename: str) -> str:
        safe = filename.replace("/", "_").replace("\\", "_")[:120]
        return f"quarantine/{tenant_id}/{uuid.uuid4()}_{safe}"

    @staticmethod
    def trusted_key(tenant_id: str, filename: str) -> str:
        safe = filename.replace("/", "_").replace("\\", "_")[:120]
        return f"tenants/{tenant_id}/fabric/{uuid.uuid4()}_{safe}"

    @staticmethod
    def render_key(tenant_id: str, job_id: str) -> str:
        return f"tenants/{tenant_id}/renders/{job_id}.png"

    # ---------------------------------------------------------------- upload
    def put_bytes(self, key: str, payload: bytes, content_type: str) -> None:
        extra = {"ContentType": content_type, "ServerSideEncryption": "aws:kms"}
        if settings.AWS_S3_KMS_KEY_ID:
            extra["SSEKMSKeyId"] = settings.AWS_S3_KMS_KEY_ID
        self.client.put_object(Bucket=self.bucket, Key=key, Body=payload, **extra)

    def get_bytes(self, key: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()

    # -------------------------------------------------------------- presign
    def presigned_preview_url(self, key: str, expires_in: int | None = None) -> str:
        ttl = min(expires_in or settings.PRESIGNED_URL_TTL_SECONDS, 900)
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=ttl,
        )

    # ---------------------------------------------------------------- delete
    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:  # pragma: no cover
            logger.error("Failed to delete S3 object %s: %s", key, exc)
            raise


storage = StorageService()
