"""Pure image helpers for the Streamlit UI.

These mirror the API's ingestion rules (magic bytes, size, decode, metadata
strip) so the standalone demo behaves the same way as the hardened backend.
No Streamlit imports here, which keeps the logic unit-testable.
"""
from __future__ import annotations

import hashlib
import io

from PIL import Image, ImageEnhance, ImageOps

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_PIXELS = 50_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

ALLOWED_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class ImageValidationError(ValueError):
    """Raised when an upload fails the demo ingestion pipeline."""


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def detect_mime(data: bytes) -> str:
    for mime, signatures in ALLOWED_SIGNATURES.items():
        if any(data.startswith(sig) for sig in signatures):
            return mime
    raise ImageValidationError("Unsupported file type (magic-byte check failed)")


def validate_image_bytes(data: bytes) -> tuple[Image.Image, str]:
    """Validate magic bytes + decode structure, returning an open PIL image."""
    if not data:
        raise ImageValidationError("Empty upload")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ImageValidationError("File exceeds the 15 MiB limit")

    mime = detect_mime(data)

    try:
        probe = Image.open(io.BytesIO(data))
        if probe.format not in ALLOWED_FORMATS:
            raise ImageValidationError("Unsupported image format")
        if getattr(probe, "n_frames", 1) != 1:
            raise ImageValidationError("Multi-frame images are not accepted")
        probe.verify()
    except ImageValidationError:
        raise
    except Image.DecompressionBombError as exc:
        raise ImageValidationError("Image dimensions exceed the safety limit") from exc
    except Exception as exc:
        raise ImageValidationError("Malformed image") from exc

    try:
        image = Image.open(io.BytesIO(data))
    except Exception as exc:
        raise ImageValidationError("Malformed image") from exc
    return image, mime


def strip_metadata(image: Image.Image) -> Image.Image:
    """Re-encode from raw pixels only, dropping EXIF/GPS/device metadata."""
    transposed = ImageOps.exif_transpose(image)
    clean = Image.new(transposed.mode, transposed.size)
    clean.putdata(list(transposed.getdata()))
    return clean


def image_to_png(image: Image.Image, max_size: int = 1024) -> bytes:
    out_img = image.convert("RGB")
    out_img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    out_img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def demo_render(image: Image.Image, prompt: str) -> bytes:
    """Deterministic local transform used when no GPU backend is connected.

    This is clearly a preview, not a diffusion render: it normalises contrast,
    boosts fabric colour, and applies a subtle studio vignette driven by the
    prompt hash.
    """
    base = image.convert("RGB")
    base.thumbnail((1024, 1024), Image.Resampling.LANCZOS)

    seed = int(sha256_hex((prompt or "default").encode("utf-8"))[:8], 16)
    colour = 1.05 + (seed % 20) / 100.0
    contrast = 1.02 + ((seed >> 4) % 10) / 100.0
    tint = ((seed >> 8) % 30, (seed >> 16) % 30, (seed >> 24) % 30)

    rendered = ImageEnhance.Color(base).enhance(colour)
    rendered = ImageEnhance.Contrast(rendered).enhance(contrast)
    overlay = Image.new("RGB", rendered.size, tint)
    rendered = Image.blend(rendered, overlay, 0.04)

    buf = io.BytesIO()
    rendered.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
