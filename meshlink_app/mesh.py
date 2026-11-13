"""
MeshLink Mesh — Bluetooth / Wi-Fi Direct / Radio mesh networking layer.
"""

import os
import json
import time
import base64
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple

from models import UIN, Message, MeshHop, base62_encode
from crypto import (
    generate_x25519_keypair,
    x25519_exchange,
    derive_key,
    encrypt_message,
    decrypt_message,
    compute_fingerprint,
)

TRANSPORT_BLUETOOTH_LE = "bluetooth_le"
TRANSPORT_WIFI_DIRECT = "wifi_direct"
TRANSPORT_RADIO = "radio"
MeshNodeID = str

def make_node_id(pubkey_x25519: bytes) -> MeshNodeID:
    h = hashlib.sha256(pubkey_x25519).digest()
    n = int.from_bytes(h[:6], "big")
    return base62_encode(n)

class MeshMessage:
    def __init__(
        self,
        msg_id: str,
        sender_uin: UIN,
        recipient_uin: UIN,
        msg_type: str,
        encrypted_payload: bytes,
        ttl_hops: int = 5,
        created_at: Optional[datetime] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.msg_id = msg_id
        self.sender_uin = sender_uin
        self.recipient_uin = recipient_uin
        self.msg_type = msg_type
        self.encrypted_payload = encrypted_payload
        self.ttl_hops = ttl_hops
        self.created_at = created_at or datetime.now(timezone.utc)
        self.metadata = metadata or {}
        self.hop_history: List[MeshHop] = []
        self.mesh_packet_id = str(uuid.uuid4())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "msg_id": self.msg_id,
            "sender_uin": str(self.sender_uin),
            "recipient_uin": str(self.recipient_uin),
            "msg_type": self.msg_type,
            "encrypted_payload": base64.b64encode(self.encrypted_payload).decode() if self.encrypted_payload else "",
            "ttl_hops": self.ttl_hops,
            "created_at": self.created_at.isoformat(),
            "mesh_packet_id": self.mesh_packet_id,
            "metadata": self.metadata,
            "hop_history": [hop.to_dict() for hop in self.hop_history],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MeshMessage":
        from models import UIN as _UIN
        sender_uin = _UIN.from_str(data["sender_uin"])
        recipient_uin = _UIN.from_str(data["recipient_uin"])
        encrypted = base64.b64decode(data["encrypted_payload"]) if data.get("encrypted_payload") else b""
        ts = data.get("created_at")
        created_at = datetime.fromisoformat(ts) if isinstance(ts, str) else None
        mm = cls(
            msg_id=data["msg_id"],
            sender_uin=sender_uin,
            recipient_uin=recipient_uin,
            msg_type=data["msg_type"],
            encrypted_payload=encrypted,
            ttl_hops=data.get("ttl_hops", 5),
            created_at=created_at,
            metadata=data.get("metadata", {}),
        )
        mm.mesh_packet_id = data.get("mesh_packet_id", str(uuid.uuid4()))
        for hop_data in data.get("hop_history", []):
            mm.hop_history.append(MeshHop.from_dict(hop_data))
        return mm

class Neighbor:
    def __init__(
        self,
        device_id: str,
        public_key_x25519: bytes,
        transport: str,
        rssi: Optional[int] = None,
        last_seen: Optional[datetime] = None,
        address: Optional[str] = None,
    ):
        self.device_id = device_id
        self.public_key_x25519 = public_key_x25519
        self.transport = transport
        self.rssi = rssi
        self.last_seen = last_seen or datetime.now(timezone.utc)
        self.address = address

    def age_minutes(self) -> float:
        if self.last_seen is None:
            return float("inf")
        delta = datetime.now(timezone.utc) - self.last_seen
        return delta.total_seconds() / 60.0

    def is_stale(self, max_age_minutes: int = 15) -> bool:
        return self.age_minutes() > max_age_minutes

    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "public_key_x25519": base64.b64encode(self.public_key_x25519).decode() if self.public_key_x25519 else "",
            "transport": self.transport,
            "rssi": self.rssi,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "address": self.address,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Neighbor":
        pk = base64.b64decode(data["public_key_x25519"]) if data.get("public_key_x25519") else b""
        ts = data.get("last_seen")
        last_seen = datetime.fromisoformat(ts) if isinstance(ts, str) else None
        return cls(
            device_id=data["device_id"],
            public_key_x25519=pk,
            transport=data["transport"],
            rssi=data.get("rssi"),
            last_seen=last_seen,
            address=data.get("address"),
        )

class SimpleMeshRouter:
    def __init__(self, node_id: MeshNodeID, max_hops: int = 5):
        self.node_id = node_id
        self.max_hops = max_hops
        self.neighbors: Dict[str, Neighbor] = {}
        self.outgoing: Dict[str, MeshMessage] = {}
        self.delivered: set = set()

    def add_neighbor(self, neighbor: Neighbor) -> None:
        self.neighbors[neighbor.device_id] = neighbor

    def remove_neighbor(self, device_id: str) -> None:
        self.neighbors.pop(device_id, None)

    def route_message(self, mesh_msg: MeshMessage) -> Optional[Neighbor]:
        if mesh_msg.ttl_hops <= 0:
            return None
        forbidden = {h.to_device_id for h in mesh_msg.hop_history}
        scored: List[Tuple[int, Neighbor]] = []
        for ndev in self.neighbors.values():
            if ndev.is_stale():
                continue
            if ndev.device_id in forbidden:
                continue
            scored.append((ndev.rssi or 0, ndev))
        if not scored:
            return None
        scored.sort(key=lambda x: x[0], reverse=True)
        chosen = scored[0][1]
        hop = MeshHop(
            hop_id=mesh_msg.mesh_packet_id,
            from_device_id=self.node_id,
            to_device_id=chosen.device_id,
            message_id=mesh_msg.msg_id,
            hop_timestamp=datetime.now(timezone.utc),
        )
        mesh_msg.hop_history.append(hop)
        mesh_msg.ttl_hops -= 1
        self.outgoing[mesh_msg.mesh_packet_id] = mesh_msg
        return chosen

    def mark_delivered(self, mesh_packet_id: str) -> None:
        self.delivered.add(mesh_packet_id)

    def is_delivered(self, mesh_packet_id: str) -> bool:
        return mesh_packet_id in self.delivered

MESH_FRAME_MAX_PAYLOAD = 96
MESH_FRAME_MAGIC = b"MESH"
MESH_FRAME_VERSION = 1
MESH_FRAME_TYPE = {"MESSAGE": 0x01, "PING": 0x02, "DISCOVERY": 0x03}

class MeshFrame:
    def __init__(
        self,
        frame_type: int,
        source_node_id: MeshNodeID,
        dest_node_id: MeshNodeID,
        payload: bytes,
        ttl: int,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        if len(payload) > MESH_FRAME_MAX_PAYLOAD:
            raise ValueError(f"Payload too large: {len(payload)} > {MESH_FRAME_MAX_PAYLOAD}")
        self.frame_type = frame_type
        self.source_node_id = source_node_id
        self.dest_node_id = dest_node_id
        self.payload = payload
        self.ttl = ttl
        self.metadata = metadata or {}
        self.frame_id = str(uuid.uuid4())

    def serialize(self) -> bytes:
        import struct
        header = (
            MESH_FRAME_MAGIC
            + bytes([MESH_FRAME_VERSION])
            + bytes([self.frame_type])
            + struct.pack(">H", int(self.source_node_id, 16) % 65536)
            + struct.pack(">H", int(self.dest_node_id, 16) % 65536)
            + bytes([self.ttl])
            + bytes([len(self.payload)])
        )
        return header + self.payload

    @staticmethod
    def deserialize(data: bytes) -> Optional["MeshFrame"]:
        if len(data) < 12:
            return None
        if data[:4] != MESH_FRAME_MAGIC:
            return None
        import struct
        version = data[4]
        frame_type = data[5]
        source_int = struct.unpack(">H", data[6:8])[0]
        dest_int = struct.unpack(">H", data[8:10])[0]
        ttl = data[10]
        payload_len = data[11]
        payload = data[12 : 12 + payload_len]
        source_node_id = f"{source_int:04x}"
        dest_node_id = f"{dest_int:04x}"
        frame = MeshFrame(
            frame_type=frame_type,
            source_node_id=source_node_id,
            dest_node_id=dest_node_id,
            payload=payload,
            ttl=ttl,
        )
        return frame

    def __repr__(self) -> str:
        return f"<MeshFrame type={self.frame_type} src={self.source_node_id} dst={self.dest_node_id} ttl={self.ttl}>"

__all__ = [
    "TRANSPORT_BLUETOOTH_LE",
    "TRANSPORT_WIFI_DIRECT",
    "TRANSPORT_RADIO",
    "MeshNodeID",
    "make_node_id",
    "MeshMessage",
    "Neighbor",
    "SimpleMeshRouter",
    "MeshFrame",
    "MESH_FRAME_MAX_PAYLOAD",
    "MESH_FRAME_MAGIC",
    "MESH_FRAME_VERSION",
    "MESH_FRAME_TYPE",
]
