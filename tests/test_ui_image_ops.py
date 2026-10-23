"""Unit tests for the standalone UI image pipeline (no Streamlit runtime needed)."""
from __future__ import annotations

import io

import pytest
from PIL import Image

from ui.image_ops import (
    MAX_UPLOAD_BYTES,
    ImageValidationError,
    demo_render,
    image_to_png,
    strip_metadata,
    validate_image_bytes,
)


def _png(size: tuple[int, int] = (64, 64)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (40, 90, 140)).save(buf, "PNG")
    return buf.getvalue()


def test_valid_png_passes_magic_and_decode():
    image, mime = validate_image_bytes(_png())
    assert mime == "image/png"
    assert image.size == (64, 64)


def test_unsupported_signature_is_rejected():
    with pytest.raises(ImageValidationError, match="magic-byte"):
        validate_image_bytes(b"GIF89a" + b"\x00" * 32)


def test_oversized_upload_is_rejected_before_decode():
    with pytest.raises(ImageValidationError, match="15 MiB"):
        validate_image_bytes(b"\x89PNG\r\n\x1a\n" + b"x" * MAX_UPLOAD_BYTES)


def test_malformed_png_is_rejected():
    with pytest.raises(ImageValidationError, match="Malformed"):
        validate_image_bytes(b"\x89PNG\r\n\x1a\n" + b"not really a png")


def test_strip_metadata_removes_exif():
    exif = Image.Exif()
    exif[271] = "ACME Camera"
    exif[272] = "Model X"
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), (10, 20, 30)).save(buf, "JPEG", exif=exif.tobytes())

    image, _ = validate_image_bytes(buf.getvalue())
    clean = strip_metadata(image)
    out = io.BytesIO()
    clean.save(out, "JPEG")
    reopened = Image.open(io.BytesIO(out.getvalue()))

    assert dict(reopened.getexif()) == {}


def test_demo_render_is_deterministic_png():
    image, _ = validate_image_bytes(_png())
    first = demo_render(image, "cotton weave")
    second = demo_render(image, "cotton weave")
    assert first == second
    assert first.startswith(b"\x89PNG\r\n\x1a\n")

    rendered = Image.open(io.BytesIO(first))
    assert rendered.format == "PNG"
    assert rendered.size == (64, 64)


def test_image_to_png_bounds_large_images():
    image = Image.new("RGB", (4000, 3000), (1, 2, 3))
    data = image_to_png(image, max_size=512)
    reopened = Image.open(io.BytesIO(data))
    assert max(reopened.size) <= 512
