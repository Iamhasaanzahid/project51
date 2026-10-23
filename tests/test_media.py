import io

import pytest
from fastapi import HTTPException
from PIL import Image
from starlette.datastructures import Headers, UploadFile

from app.services import media_sanitizer
from app.services.media_sanitizer import FabricMediaSanitizer


def _upload(data: bytes, filename: str = "fabric.jpg", content_type: str = "image/jpeg") -> UploadFile:
    return UploadFile(
        filename=filename,
        file=io.BytesIO(data),
        headers=Headers({"content-type": content_type}),
    )


def _jpeg_bytes() -> bytes:
    img = Image.new("RGB", (64, 48), (200, 30, 30))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _png_bytes() -> bytes:
    img = Image.new("RGB", (32, 32), (10, 120, 220))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def test_accepts_real_jpeg_and_png():
    raw, mime = await FabricMediaSanitizer.validate_magic_bytes(_upload(_jpeg_bytes()))
    assert mime == "image/jpeg" and raw

    raw, mime = await FabricMediaSanitizer.validate_magic_bytes(_upload(_png_bytes(), "f.png", "image/png"))
    assert mime == "image/png" and raw


async def test_rejects_polyglot_php_disguised_as_jpg():
    payload = b"<?php system($_GET['c']); ?>" + b"\x00" * 64
    with pytest.raises(HTTPException) as exc:
        await FabricMediaSanitizer.validate_magic_bytes(_upload(payload))
    assert exc.value.status_code == 415


async def test_rejects_empty_upload():
    with pytest.raises(HTTPException) as exc:
        await FabricMediaSanitizer.validate_magic_bytes(_upload(b""))
    assert exc.value.status_code == 400


async def test_rejects_oversized_upload(monkeypatch):
    monkeypatch.setattr(media_sanitizer, "MAX_UPLOAD_BYTES", 1024)
    with pytest.raises(HTTPException) as exc:
        await FabricMediaSanitizer.validate_magic_bytes(_upload(b"\xff\xd8\xff" + b"A" * 4096))
    assert exc.value.status_code == 413


def test_exif_and_device_tags_are_stripped():
    img = Image.new("RGB", (64, 64), (0, 128, 0))
    exif = Image.Exif()
    exif[0x010F] = "EvilCamera"      # Make
    exif[0x0110] = "Model-X"         # Model
    exif[0x0132] = "2026:01:01 00:00:00"
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)

    clean, width, height = FabricMediaSanitizer.strip_exif_and_metadata(buf.getvalue())
    assert (width, height) == (64, 64)

    with Image.open(io.BytesIO(clean)) as out:
        cleaned_exif = out.getexif()
        assert 0x010F not in cleaned_exif
        assert 0x0110 not in cleaned_exif
        assert 0x0132 not in cleaned_exif


def test_malformed_image_is_rejected():
    with pytest.raises(HTTPException) as exc:
        FabricMediaSanitizer.strip_exif_and_metadata(b"not an image at all")
    assert exc.value.status_code in (415, 422)
