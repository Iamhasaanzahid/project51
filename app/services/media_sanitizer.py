"""
Media ingestion hardening.

Pipeline for every uploaded fabric image:
  1. size limit (streamed, never trusting Content-Length)
  2. libmagic binary signature check  -> blocks extension/polyglot spoofing
  3. Pillow decode + verify           -> blocks malformed/crafted images
  4. ClamAV scan of the raw buffer    -> blocks known malware
  5. EXIF/GPS/device metadata strip   -> re-encodes from raw pixels only
  6. decompression-bomb guard         -> bounds GPU memory use

No upload ever reaches PyTorch / OpenCV before all six checks pass.
"""
from __future__ import annotations

import io
import logging

import magic
from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps

from app.core.config import settings

logger = logging.getLogger("aifabric.media")

# Hard ceiling before we even look at the pixels.
MAX_UPLOAD_BYTES = 15 * 1024 * 1024          # 15 MiB
MAX_PIXELS = 50_000_000                       # ~50 MP decompression-bomb guard
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

ALLOWED_MIME_SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class FabricMediaSanitizer:
    # ------------------------------------------------------------------ 1+2
    @staticmethod
    async def validate_magic_bytes(file: UploadFile) -> tuple[bytes, str]:
        header = await file.read(2048)
        await file.seek(0)

        if not header:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty upload")

        detected_mime = magic.from_buffer(header, mime=True)
        if detected_mime not in ALLOWED_MIME_SIGNATURES:
            logger.warning("Rejected upload: detected MIME %s", detected_mime)
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unsupported file type",
            )

        if not any(header.startswith(sig) for sig in ALLOWED_MIME_SIGNATURES[detected_mime]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File signature mismatch",
            )

        # Read in bounded chunks so a lying Content-Length cannot exhaust RAM.
        chunks, total = [], 0
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Upload exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MiB",
                )
            chunks.append(chunk)
        return b"".join(chunks), detected_mime

    # -------------------------------------------------------------------- 3
    @staticmethod
    def _open_verified(image_bytes: bytes) -> Image.Image:
        try:
            probe = Image.open(io.BytesIO(image_bytes))
            if probe.format not in ALLOWED_FORMATS:
                raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported image format")
            if getattr(probe, "n_frames", 1) != 1:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Multi-frame images are not accepted")
            probe.verify()  # structure check; consumes the object
        except HTTPException:
            raise
        except Image.DecompressionBombError as exc:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image dimensions too large") from exc
        except Exception as exc:
            logger.warning("Malformed image rejected: %s", exc)
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Malformed image") from exc

        try:
            return Image.open(io.BytesIO(image_bytes))
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Malformed image") from exc

    # -------------------------------------------------------------------- 4
    @staticmethod
    def scan_for_malware_clamav(image_bytes: bytes) -> None:
        try:
            import clamd

            client = clamd.ClamdNetworkSocket(
                host=settings.CLAMAV_HOST,
                port=settings.CLAMAV_PORT,
                timeout=settings.CLAMAV_TIMEOUT_SECONDS,
            )
            result = client.instream(io.BytesIO(image_bytes))
            verdict, signature = result.get("stream", ("UNKNOWN", None))
            if verdict == "FOUND":
                logger.critical("ClamAV malware detected: %s", signature)
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload rejected by malware scanner")
            if verdict != "OK":
                raise clamd.ClamError(f"unexpected verdict {verdict}")
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("ClamAV scan failed: %s", exc)
            if settings.CLAMAV_FAIL_CLOSED:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Malware scanning unavailable",
                ) from exc

    # -------------------------------------------------------------------- 5
    @staticmethod
    def strip_exif_and_metadata(image_bytes: bytes) -> tuple[bytes, int, int]:
        img = FabricMediaSanitizer._open_verified(image_bytes)
        source_format = img.format
        try:
            img = ImageOps.exif_transpose(img)  # bake orientation, then drop EXIF
            clean = Image.new(img.mode, img.size)
            clean.putdata(list(img.getdata()))

            out = io.BytesIO()
            target = source_format if source_format in ALLOWED_FORMATS else "PNG"
            save_kwargs = {"optimize": True}
            if target == "JPEG":
                save_kwargs.update(quality=95, subsampling="4:2:0", progressive=False)
            clean.save(out, format=target, **save_kwargs)
            return out.getvalue(), img.size[0], img.size[1]
        finally:
            img.close()

    # ------------------------------------------------------------- orchestr.
    @classmethod
    async def sanitize_upload(cls, file: UploadFile) -> tuple[bytes, str, int, int]:
        raw, mime = await cls.validate_magic_bytes(file)
        cls.scan_for_malware_clamav(raw)
        clean, width, height = cls.strip_exif_and_metadata(raw)
        logger.info("Fabric image sanitised (%s, %dx%d)", mime, width, height)
        return clean, mime, width, height
