import boto3
from botocore.exceptions import ClientError
import logging
from app.core.config import settings

logger = logging.getLogger("aifabric.storage")

class S3StorageService:
    def __init__(self):
        self.s3_client = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        self.bucket_name = settings.AWS_S3_BUCKET_NAME

    def generate_presigned_preview_url(self, object_key: str, expiration_seconds: int = 900) -> str:
        """
        Generates AWS S3 Presigned URL expiring within 15 minutes (900 seconds)
        for secure download of fabric previews and genAI renders without exposing public buckets.
        """
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': object_key,
                },
                ExpiresIn=expiration_seconds
            )
            logger.info(f"Generated S3 presigned URL for key {object_key}, expiring in {expiration_seconds}s.")
            return url
        except ClientError as e:
            logger.error(f"Failed to generate S3 presigned URL: {e}")
            raise e
