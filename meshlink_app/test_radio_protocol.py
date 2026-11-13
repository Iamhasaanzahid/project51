"""
MeshLink radio transport protocol tests.

These tests mirror the Kotlin implementations byte-for-byte:

  - meshlink_android/.../mesh/RadioTransport.kt  (SMS chunking + reassembly)
  - meshlink_android/.../mesh/MeshFrame.kt       (binary frame layout)

Run:  python3 test_radio_protocol.py
"""

import base64
import os
import struct

PREFIX = "ML1"
SMS_MAX_CHARS = 150
MAX_PAYLOAD = 96
MAGIC = b"MESH"
VERSION = 1
HEADER_SIZE = 12


# --------------------------------------------------------------------------
# Kotlin RadioTransport mirror
# --------------------------------------------------------------------------

def header_reserve(kind: str, msg_id: str) -> int:
    # PREFIX | kind | msgId | index | total |
    return len(PREFIX) + 1 + len(kind) + 1 + len(msg_id) + 1 + 3 + 1 + 3 + 1


def chunk_payload(encoded: str, kind: str, msg_id: str):
    reserve = header_reserve(kind, msg_id)
    chunk_size = max(16, SMS_MAX_CHARS - reserve)
    if not encoded:
        return [""]
    return [encoded[i:i + chunk_size] for i in range(0, len(encoded), chunk_size)]


def build_sms_bodies(payload: bytes, kind: str = "F", msg_id: str = "deadbeef"):
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    chunks = chunk_payload(encoded, kind, msg_id)
    total = len(chunks)
    bodies = [
        f"{PREFIX}|{kind}|{msg_id}|{i + 1}|{total}|{data}"
        for i, data in enumerate(chunks)
    ]
    return bodies


def parse_and_reassemble(bodies):
    parts = {}
    total = 0
    kind = None
    for body in bodies:
        assert body.startswith(PREFIX + "|")
        _, k, _msg_id, index, total_s, data = body.split("|", 5)
        kind = k
        index = int(index)
        total = int(total_s)
        parts[index] = data
    assert len(parts) == total, f"missing chunks: {len(parts)}/{total}"
    joined = "".join(parts[i] for i in range(1, total + 1))
    pad = "=" * (-len(joined) % 4)
    raw = base64.urlsafe_b64decode(joined + pad)
    return kind, raw


# --------------------------------------------------------------------------
# Kotlin MeshFrame mirror
# --------------------------------------------------------------------------

def node_id16(text: str) -> int:
    import hashlib
    h = hashlib.sha256(text.encode()).digest()
    return (h[0] << 8) | h[1]


def serialize_frame(frame_type, src_id, dst_id, ttl, payload: bytes) -> bytes:
    assert len(payload) <= MAX_PAYLOAD
    return (
        MAGIC
        + bytes([VERSION, frame_type])
        + struct.pack(">H", src_id & 0xFFFF)
        + struct.pack(">H", dst_id & 0xFFFF)
        + bytes([ttl, len(payload)])
        + payload
    )


def deserialize_frame(data: bytes):
    if len(data) < HEADER_SIZE or data[:4] != MAGIC:
        return None
    version = data[4]
    if version != VERSION:
        return None
    frame_type = data[5]
    src_id = struct.unpack(">H", data[6:8])[0]
    dst_id = struct.unpack(">H", data[8:10])[0]
    ttl = data[10]
    length = data[11]
    if length > MAX_PAYLOAD or len(data) < HEADER_SIZE + length:
        return None
    return frame_type, src_id, dst_id, ttl, data[12:12 + length]


# --------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------

def test_frame_roundtrip():
    payload = os.urandom(MAX_PAYLOAD)
    raw = serialize_frame(1, node_id16("+92-MZ-123456"), node_id16("+92-MZ-654321"), 5, payload)
    assert raw[:4] == b"MESH"
    assert len(raw) == HEADER_SIZE + MAX_PAYLOAD
    parsed = deserialize_frame(raw)
    assert parsed is not None
    frame_type, src, dst, ttl, body = parsed
    assert (frame_type, src, dst, ttl) == (1, node_id16("+92-MZ-123456"), node_id16("+92-MZ-654321"), 5)
    assert body == payload


def test_frame_rejects_corrupt():
    good = serialize_frame(1, 1, 2, 5, b"hi")
    assert deserialize_frame(b"XXXX" + good[4:]) is None
    assert deserialize_frame(good[:5]) is None


def test_radio_sms_chunking_96_byte_frame():
    payload = os.urandom(MAX_PAYLOAD)
    frame = serialize_frame(1, 111, 222, 5, payload)
    bodies = build_sms_bodies(frame, kind="F")

    # Every SMS must be a valid, single-segment SMS (<= 150 chars).
    for body in bodies:
        assert len(body) <= SMS_MAX_CHARS, f"SMS too long: {len(body)}"
        assert len(body.encode("utf-8")) == len(body)  # base64 is ASCII

    kind, reconstructed = parse_and_reassemble(bodies)
    assert kind == "F"
    assert reconstructed == frame

    parsed = deserialize_frame(reconstructed)
    assert parsed is not None and parsed[4] == payload


def test_radio_sms_text_multichunk():
    text = "A" * 700  # -> ~934 base64 chars -> ~8 SMS chunks
    bodies = build_sms_bodies(text.encode(), kind="T", msg_id="a1b2c3d4")
    assert len(bodies) > 1
    for body in bodies:
        assert len(body) <= SMS_MAX_CHARS
    kind, raw = parse_and_reassemble(bodies)
    assert kind == "T"
    assert raw.decode() == text


def test_radio_sms_empty_payload():
    bodies = build_sms_bodies(b"", kind="F", msg_id="00000000")
    assert len(bodies) == 1
    kind, raw = parse_and_reassemble(bodies)
    assert raw == b""


def test_chunk_size_matches_kotlin_formula():
    reserve = header_reserve("F", "deadbeef")
    # Kotlin: PREFIX + 1 + kind + 1 + msgId + 1 + 3 + 1 + 3 + 1
    assert reserve == 3 + 1 + 1 + 1 + 8 + 1 + 3 + 1 + 3 + 1
    assert SMS_MAX_CHARS - reserve == 127


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for t in tests:
        try:
            t()
            print(f"  ✅ PASS  {t.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  ❌ FAIL  {t.__name__}  ({e})")
        except Exception as e:  # noqa: BLE001
            print(f"  ❌ ERROR {t.__name__}  ({type(e).__name__}: {e})")
    print(f"\n{passed}/{len(tests)} radio protocol tests passed")
    raise SystemExit(0 if passed == len(tests) else 1)
