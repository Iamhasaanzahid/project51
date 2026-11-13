"""
MeshLink Models — Data models for users, messages, and mesh state.

Design notes:
  - UIN (Unique IDentifier Number): format +COUNTRY-ORG-NNNNNN
    Example: +92-MZ-482913
  - All IDs are base62-encoded public keys for crypto agility
  - Messages are stored encrypted; only sender/receiver can decrypt
  - Mesh state tracks offline hops and device discovery
"""

import os
import re
import base64
import string
import random
import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple


def encode_uin(country_code: str, org_code: str = "MZ", numeric_part: Optional[str] = None) -> str:
    """Encode a UIN in format +COUNTRY-ORG-NNNNNN.
    Example: +92-MZ-482913
    """
    if numeric_part is None:
        numeric_part = _rand_numeric(Settings.UIN_LENGTH)
    cc = country_code if country_code.startswith("+") else f"+{country_code}"
    return f"{cc}-{org_code}-{numeric_part}"


def decode_uin(uin: str) -> Tuple[str, str, str]:
    """Decode a UIN into (country_code, org_code, numeric_part)."""
    pattern = r"^\+(\d{1,3})-([A-Z]{1,10})-(\d{1,20})$"
    m = re.match(pattern, uin)
    if not m:
        raise ValueError(f"Invalid UIN format: {uin}")
    country_code = f"+{m.group(1)}"
    org_code = m.group(2)
    numeric_part = m.group(3)
    return country_code, org_code, numeric_part


def _rand_numeric(length: int = 6) -> str:
    return base62_encode(int.from_bytes(os.urandom(length), "big"))


def base62_encode(number: int) -> str:
    """Encode an integer as base62 string (0-9, a-z, A-Z)."""
    chars = string.digits + string.ascii_letters
    if number == 0:
        return chars[0]
    result = ""
    while number > 0:
        number, rem = divmod(number, 62)
        result = chars[rem] + result
    return result


class UIN:
    """Represents a MeshLink user identifier."""

    def __init__(self, country_code: str, org_code: str = "MZ", numeric_part: Optional[str] = None):
        self.country_code = country_code
        self.org_code = org_code
        self.numeric_part = numeric_part or _rand_numeric(6)
        self.value = encode_uin(country_code, org_code, self.numeric_part)

    def __str__(self) -> str:
        return self.value

    def __eq__(self, other: object) -> bool:
        if isinstance(other, UIN):
            return self.value == other.value
        return self.value == other

    def __hash__(self) -> int:
        return hash(self.value)


class User:
    """A MeshLink user with E2EE keys."""

    def __init__(
        self,
        uin: UIN,
        display_name: str,
        pubkey_x25519: bytes,
        created_at: Optional[datetime] = None,
    ):
        self.uin = uin
        self.display_name = display_name
        self.pubkey_x25519 = pubkey_x25519
        self.created_at = created_at or datetime.now(timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "uin": str(self.uin),
            "display_name": self.display_name,
            "pubkey_x25519": base64.b64encode(self.pubkey_x25519).decode(),
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "User":
        country, org, num = decode_uin(data["uin"])
        pubkey = base64.b64decode(data["pubkey_x25519"])
        return cls(
            uin=UIN(country_code=country, org_code=org, numeric_part=num),
            display_name=data["display_name"],
            pubkey_x25519=pubkey,
            created_at=datetime.fromisoformat(data["created_at"]) if isinstance(data.get("created_at"), str) else data.get("created_at"),
        )

    def get_fingerprint(self) -> str:
        """Return a short fingerprint for this user's public key."""
        from crypto import compute_fingerprint
        return compute_fingerprint(self.pubkey_x25519)


class Message:
    """An encrypted message in a MeshLink conversation."""

    TEXT = "text"
    IMAGE = "image"
    VOICE_NOTE = "voice_note"
    LOCATION = "location"

    def __init__(
        self,
        msg_id: str,
        sender_uin: UIN,
        recipient_uin: UIN,
        msg_type: str,
        content: bytes,
        timestamp: Optional[datetime] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.msg_id = msg_id
        self.sender_uin = sender_uin
        self.recipient_uin = recipient_uin
        self.msg_type = msg_type
        self.content = content
        self.timestamp = timestamp or datetime.now(timezone.utc)
        self.metadata = metadata or {}
        self.status: str = "sent"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "msg_id": self.msg_id,
            "sender_uin": str(self.sender_uin),
            "recipient_uin": str(self.recipient_uin),
            "msg_type": self.msg_type,
            "content": base64.b64encode(self.content).decode() if self.content else "",
            "timestamp": self.timestamp.isoformat(),
            "status": self.status,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Message":
        from models import UIN as _UIN
        sender_uin = _UIN.from_str(data["sender_uin"])
        recipient_uin = _UIN.from_str(data["recipient_uin"])
        content = base64.b64decode(data["content"]) if data.get("content") else b""
        ts = data.get("timestamp")
        timestamp = datetime.fromisoformat(ts) if isinstance(ts, str) else None
        msg = cls(
            msg_id=data["msg_id"],
            sender_uin=sender_uin,
            recipient_uin=recipient_uin,
            msg_type=data["msg_type"],
            content=content,
            timestamp=timestamp,
            metadata=data.get("metadata", {}),
        )
        msg.status = data.get("status", "sent")
        return msg


class MeshHop:
    """Tracks a single hop in the Bluetooth/Wi-Fi Direct mesh."""

    def __init__(
        self,
        hop_id: str,
        from_device_id: str,
        to_device_id: str,
        message_id: str,
        hop_timestamp: datetime,
        status: str = "pending",
    ):
        self.hop_id = hop_id
        self.from_device_id = from_device_id
        self.to_device_id = to_device_id
        self.message_id = message_id
        self.hop_timestamp = hop_timestamp
        self.status = status

    def to_dict(self) -> Dict[str, Any]:
        return {
            "hop_id": self.hop_id,
            "from_device_id": self.from_device_id,
            "to_device_id": self.to_device_id,
            "message_id": self.message_id,
            "hop_timestamp": self.hop_timestamp.isoformat(),
            "status": self.status,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MeshHop":
        ts = data.get("hop_timestamp")
        hop_timestamp = datetime.fromisoformat(ts) if isinstance(ts, str) else None
        return cls(
            hop_id=data["hop_id"],
            from_device_id=data["from_device_id"],
            to_device_id=data["to_device_id"],
            message_id=data["message_id"],
            hop_timestamp=hop_timestamp,
            status=data.get("status", "pending"),
        )