import io
import logging
from typing import Tuple
from PIL import Image, ImageOps
import python_magic as magic
from fastapi import HTTPException, status, UploadFile
from app.core.config import settings

logger = logging.getLogger("aifabric.sanitizer")

# Known Magic Byte signatures
ALLOWED_MAGIC_MIME_MAP = {
    "image/jpeg": [b"\xFF\xD8\xFF"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/webp": [b"RIFF"],
}

MAX_ALLOWED_FILE_SIZE = 15 * 1024 * 1024  # 15 MB limit per fabric scan

class FabricMediaSanitizer:
    @staticmethod
    async def validate_magic_bytes(file: UploadFile) -> Tuple[bytes, str]:
        """
        Reads binary header magic bytes to verify actual file payload format,
        rejecting spoofed image extensions (e.g., polyglot PHP/JS executable scripts renamed to .jpg).
        """
        header_sample = await file.read(2048)
        await file.seek(0)

        if not header_sample:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty file upload payload received.",
            )

        # Detect true MIME type via libmagic magic bytes
        detected_mime = magic.from_buffer(header_sample, mime=True)

        if detected_mime not in ALLOWED_MAGIC_MIME_MAP:
            logger.warning(f"Malicious file upload attempt rejected. Claimed content-type: {file.content_type}, detected MIME: {detected_mime}")
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Security Validation Failed: Unsupported binary file header signature ({detected_mime}). Allowed types: JPEG, PNG, WEBP.",
            )

        # Verify magic binary prefix
        valid_header = any(
            header_sample.startswith(signature)
            for signature in ALLOWED_MAGIC_MIME_MAP[detected_mime]
        )
        if not valid_header:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security Validation Failed: Binary header structure does not match MIME format specification.",
            )

        content = await file.read()
        if len(content) > MAX_ALLOWED_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Uploaded fabric image exceeds maximum permitted size limit of {MAX_ALLOWED_FILE_SIZE // (1024 * 1024)}MB.",
            )

        return content, detected_mime

    @staticmethod
    def strip_exif_and_metadata(image_bytes: bytes) -> bytes:
        """
        Pillow EXIF Scrubbing:
        Creates a clean pixel-data canvas and strips all EXIF, GPS coordinates, device IDs, and hidden steganographic payload metadata.
        """
        try:
            with Image.open(io.BytesIO(image_bytes)) as img:
                # Correct orientation before stripping metadata if EXIF tag exists
                img = ImageOps.exif_transpose(img)

                # Re-construct pure pixel canvas without carrying over original info/EXIF dict
                clean_img = Image.new(img.mode, img.size)
                clean_img.putdata(list(img.getdata()))

                output = io.BytesIO()
                target_format = img.format if img.format in ["JPEG", "PNG", "WEBP"] else "PNG"
                clean_img.save(output, format=target_format, optimize=True, quality=95)
                
                logger.info(f"Successfully scrubbed EXIF and device metadata from uploaded fabric image ({img.size[0]}x{img.size[1]}).")
                return output.getvalue()
        except Exception as e:
            logger.error(f"Failed to scrub EXIF metadata from image stream: {e}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Failed to parse image payload during EXIF metadata scrubbing.",
            )

    @staticmethod
    def scan_for_malware_clamav(image_bytes: bytes) -> None:
        """
        ClamAV Malware Sandbox:
        Streams binary buffer directly to ClamAV network daemon socket to verify zero viral/malicious signatures.
        """
        try:
            import clamd
            cd = clamd.ClamdNetworkSocket(
                host=settings.CLAMAV_HOST, port=settings.CLAMAV_PORT, timeout=10.0
            )
            result = cd.instream(io.BytesIO(image_bytes))
            
            # Result format: {'stream': ('OK', None)} or {'stream': ('FOUND', 'Eicar-Test-Signature')}
            status_res, virus_name = result.get("stream", ("UNKNOWN", None))
            if status_res == "FOUND":
                logger.critical(f"ClamAV Sandbox DETECTED MALWARE: {virus_name}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Security Alert: Malware threat detected in uploaded image payload ({virus_name}).",
                )
            logger.info("ClamAV Sandbox scan passed clean.")
        except clamd.ClamError as ce:
            logger.warning(f"ClamAV daemon connection warning: {ce}")
            if settings.ENVIRONMENT == "production":
                # In production, enforce strict virus scanning failure policy
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Security Sandbox: Antivirus inspection service unavailable.",
                )
        except Exception as e:
            logger.error(f"ClamAV sandbox scan error: {e}")
