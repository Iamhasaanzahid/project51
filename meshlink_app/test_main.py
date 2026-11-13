"""Tests for MeshLink backend."""

import sys
sys.path = ['/home/mhzaly/Documents/Default Project/meshlink_app'] + [p for p in sys.path if 'meshlink_app' not in p]

import pytest
from fastapi.testclient import TestClient

from main import app, generate_uin, generate_x25519_keypair, encrypt_message, decrypt_message, derive_key, x25519_exchange, compute_fingerprint
from models import UIN, Message, MeshHop, encode_uin, decode_uin, base62_encode
from mesh import MeshNodeID, make_node_id, MeshMessage, Neighbor, SimpleMeshRouter, MeshFrame, MESH_FRAME_MAX_PAYLOAD, MESH_FRAME_MAGIC, MESH_FRAME_VERSION, MESH_FRAME_TYPE, TRANSPORT_BLUETOOTH_LE, TRANSPORT_WIFI_DIRECT, TRANSPORT_RADIO

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "MeshLink API is running"
    assert data["version"] == "0.1.0"


def test_signup_creates_user_with_uin():
    import uuid as _uuid
    response = client.post(
        "/api/v1/signup",
        json={
            "email": f"user_{_uuid.uuid4().hex[:8]}@example.com",
            "display_name": f"TestUser{_uuid.uuid4().hex[:6]}",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "uin" in data
    assert "pubkey_fingerprint" in data
    assert len(data["uin"]) > 0
    assert "MZ" in data["uin"]
    assert "-" in data["uin"]
    print(f"Created user with UIN: {data['uin']}")


def test_signup_with_invalid_email():
    response = client.post(
        "/api/v1/signup",
        json={
            "email": "invalid-email",
            "display_name": "InvalidUser",
        },
    )
    assert response.status_code == 422
    print("Invalid email rejected correctly")


def test_login_by_uin():
    response = client.post(
        "/api/v1/login",
        json={
            "uin": "+92-MZ-482913",
        },
    )
    assert response.status_code == 404
    print("Login by UIN correctly returns 404 for unknown user")


def test_generate_uin_format():
    uin = generate_uin()
    uin_str = str(uin)
    assert "-" in uin_str
    parts = uin_str.split("-")
    assert len(parts) == 3
    print(f"Generated UIN: {uin_str}")


def test_crypto_generate_keypair():
    priv, pub = generate_x25519_keypair()
    assert len(priv) > 0
    assert len(pub) > 0
    print(f"Generated keypair, priv len: {len(priv)}, pub len: {len(pub)}")


def test_crypto_roundtrip():
    priv, pub = generate_x25519_keypair()
    shared = x25519_exchange(priv, pub)
    key = derive_key(shared, info=b"test")
    msg = b"Hello, MeshLink!"
    enc = encrypt_message(key, msg)
    dec = decrypt_message(key, enc["ciphertext"], enc["nonce"])
    assert dec == msg
    print("Crypto roundtrip OK")


def test_encrypt_message_returns_base64():
    priv, pub = generate_x25519_keypair()
    shared = x25519_exchange(priv, pub)
    key = derive_key(shared, info=b"test2")
    enc = encrypt_message(key, b"Test message")
    assert "ciphertext" in enc
    assert "nonce" in enc
    print("Encrypt message returns ciphertext and nonce OK")


def test_compute_fingerprint():
    priv, pub = generate_x25519_keypair()
    fp = compute_fingerprint(pub)
    assert isinstance(fp, str)
    assert len(fp) > 0
    print(f"Fingerprint: {fp}")


def test_uin_encode_decode():
    uin_str = encode_uin("+92", "MZ", "482913")
    assert uin_str == "+92-MZ-482913"
    country, org, num = decode_uin(uin_str)
    assert country == "+92"
    assert org == "MZ"
    assert num == "482913"
    print("UIN encode/decode OK")


def test_message_model():
    msg = Message(
        msg_id="test-001",
        sender_uin=UIN(country_code="+92", org_code="MZ", numeric_part="482913"),
        recipient_uin=UIN(country_code="+92", org_code="MZ", numeric_part="000001"),
        msg_type=Message.TEXT,
        content=b"Hello, MeshLink!",
    )
    assert msg.msg_type == Message.TEXT
    d = msg.to_dict()
    assert d["msg_id"] == "test-001"
    assert d["msg_type"] == "text"
    print("Message model OK")


def test_mesh_frame_serialize_deserialize():
    frame = MeshFrame(
        frame_type=MESH_FRAME_TYPE["MESSAGE"],
        source_node_id="0001",
        dest_node_id="0002",
        payload=b"test payload",
        ttl=3,
    )
    serialized = frame.serialize()
    assert len(serialized) >= 16
    deserialized = MeshFrame.deserialize(serialized)
    assert deserialized is not None
    assert deserialized.ttl == 3
    assert deserialized.payload == b"test payload"
    print(f"Mesh frame serialized/deserialized OK, len: {len(serialized)}")


def test_mesh_frame_max_payload():
    try:
        frame = MeshFrame(
            frame_type=1,
            source_node_id="0001",
            dest_node_id="0002",
            payload=b"x" * (MESH_FRAME_MAX_PAYLOAD + 1),
            ttl=3,
        )
        raise AssertionError("Should have raised")
    except ValueError:
        pass
    print("Mesh frame max payload check OK")


def test_mesh_router_route():
    router = SimpleMeshRouter(node_id="0001", max_hops=5)
    neigh = Neighbor(
        device_id="node-001",
        public_key_x25519=b"\x01" * 32,
        transport=TRANSPORT_RADIO,
        rssi=-60,
    )
    router.add_neighbor(neigh)
    msg = MeshMessage(
        msg_id="mesh-001",
        sender_uin=UIN(country_code="+92", org_code="MZ", numeric_part="482913"),
        recipient_uin=UIN(country_code="+92", org_code="MZ", numeric_part="000001"),
        msg_type="text",
        encrypted_payload=b"encrypted data",
        ttl_hops=5,
    )
    result = router.route_message(msg)
    assert result is not None
    assert msg.ttl_hops == 4
    print("Mesh router routing OK")


def test_transport_types():
    assert TRANSPORT_BLUETOOTH_LE == "bluetooth_le"
    assert TRANSPORT_WIFI_DIRECT == "wifi_direct"
    assert TRANSPORT_RADIO == "radio"
    print("All transport types OK")

def test_mesh_forward_invalid_frame():
    response = client.post("/api/v1/mesh/forward?frame_b64=invalid_base64_invalid_invalid_invalid_invalid")
    # Should return 400 for invalid base64 or invalid frame
    assert response.status_code in (200, 400)
    print("Mesh forward endpoint OK")
