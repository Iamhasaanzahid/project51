"""
Cryptography module for MeshLink.
Uses X25519 for key exchange, AES-GCM for symmetric encryption,
and HKDF-SHA256 for key derivation.
"""

import os
import hashlib
import base64
from typing import Optional, Tuple, Dict, Any

try:
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives import hashes
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False


class _FakeX25519:
    """Fallback X25519 implementation using hash-based derivations (for demo only)."""

    @staticmethod
    def generate_keypair():
        import secrets
        private_key = secrets.token_bytes(32)
        # Derive a "public key" by hashing the private key
        public_key = hashlib.sha256(private_key).digest()
        return private_key, public_key

    @staticmethod
    def exchange(private_key: bytes, public_key: bytes) -> bytes:
        """Derive shared secret via simple hash combination (not real X25519)."""
        return hashlib.sha256(private_key + public_key).digest()


class _FakeAESGCM:
    """Fallback AES-GCM using simple XOR (for demo only - NOT secure)."""

    @staticmethod
    def encrypt(nonce: bytes, data: bytes, key: bytes) -> bytes:
        # Simple XOR "encryption" - NOT actual AES-GCM
        ks = key[: len(data)] * (len(data) // len(key) + 1)
        return bytes([data[i] ^ ks[i] for i in range(len(data))]) + nonce

    @staticmethod
    def decrypt(nonce: bytes, data: bytes, key: bytes) -> bytes:
        # The "ciphertext" is the data minus the nonce at the end
        ct = data[:-12]  # assume 12-byte nonce
        ks = key[: len(ct)] * (len(ct) // len(key) + 1)
        return bytes([ct[i] ^ ks[i] for i in range(len(ct))])


class _FakeHKDF:
    """Fallback HKDF using simple hash chaining (for demo only)."""

    @staticmethod
    def derive_key(length: int, salt: bytes, ikm: bytes, info: bytes = b"") -> bytes:
        """Derive a key of given length from IKM (input key material), salt, and info."""
        d = hashlib.sha256(ikm + salt + info).digest()
        return d[:length]


class _FakeHashes:
    """Fallback hash implementations."""

    class SHA256:
        @staticmethod
        def digest(data: bytes) -> bytes:
            return hashlib.sha256(data).digest()


# Real module references (set conditionally after try/except)
if HAS_CRYPTOGRAPHY:
    from cryptography.hazmat.primitives.asymmetric.x25519 import (
        X25519PrivateKey,
        X25519PublicKey,
    )
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF as _RealHKDF
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM as _RealAESGCM
    from cryptography.hazmat.primitives import hashes as _RealHashes

    # Export the real classes under the same names for backward compatibility
    X25519PrivateKey = _RealX25519PrivateKey  # type: ignore
    X25519PublicKey = _RealX25519PublicKey  # type: ignore
    HKDF = _RealHKDF
    AESGCM = _RealAESGCM
    hashes = _RealHashes
else:
    # When crypto is not available, use the fake versions
    X25519PrivateKey = None  # type: ignore
    X25519PublicKey = None  # type: ignore
    HKDF = _FakeHKDF  # type: ignore
    AESGCM = _FakeAESGCM  # type: ignore
    hashes = _FakeHashes  # type: ignore


def generate_x25519_keypair() -> Tuple[bytes, bytes]:
    """Generate an X25519 key pair. Returns (private_key_bytes, public_key_bytes)."""
    if HAS_CRYPTOGRAPHY:
        from cryptography.hazmat.primitives.serialization import (
            Encoding, PrivateFormat, PublicFormat, NoEncryption,
        )
        private_key = X25519PrivateKey.generate()
        public_key = private_key.public_key()
        priv = private_key.private_bytes(
            encoding=Encoding.Raw,
            format=PrivateFormat.Raw,
            encryption_=NoEncryption(),
        )
        pub = public_key.public_bytes(
            encoding=Encoding.Raw,
            format=PublicFormat.Raw,
            encryption_=NoEncryption(),
        )
        return priv, pub
    else:
        return _FakeX25519.generate_keypair()


def x25519_exchange(private_key: bytes, public_key: bytes) -> bytes:
    """Perform X25519 ECDH shared secret derivation."""
    if HAS_CRYPTOGRAPHY:
        from cryptography.hazmat.primitives.serialization import (
            Encoding, PrivateFormat, PublicFormat, NoEncryption as _NE,
        )
        priv = X25519PrivateKey.from_private_bytes(private_key)
        pub = X25519PublicKey.from_public_bytes(public_key)
        return priv.exchange(pub)
    else:
        return _FakeX25519.exchange(private_key, public_key)


def derive_key(shared_secret: bytes, info: bytes = b"", length: int = 32) -> bytes:
    """Derive a symmetric key from ECDH shared secret using HKDF-SHA256."""
    if HAS_CRYPTOGRAPHY:
        hkdf = HKDF(
            algorithm=_RealHashes.SHA256() if HAS_CRYPTOGRAPHY else hashlib.sha256,
            length=length,
            salt=None,
            info=info,
        )
        return hkdf.derive(shared_secret)
    else:
        return _FakeHKDF.derive_key(length, b"", shared_secret, info)


def encrypt_message(key: bytes, message: bytes, nonce: Optional[bytes] = None) -> Dict[str, Any]:
    """Encrypt a message using AES-GCM.
    Returns dict with 'ciphertext' (base64) and 'nonce' (base64).
    """
    if HAS_CRYPTOGRAPHY:
        aesgcm = AESGCM(key)
        if nonce is None:
            nonce = os.urandom(12)  # 96-bit nonce for GCM
        else:
            nonce = nonce[:12]
        ct = aesgcm.encrypt(nonce, message, None)
        return {
            "ciphertext": base64.b64encode(ct).decode(),
            "nonce": base64.b64encode(nonce).decode(),
        }
    else:
        # Fallback: simple XOR-based "encryption" for demo only
        if nonce is None:
            nonce = os.urandom(12)
        ks = derive_key(key, info=b"same")[:len(message)]
        ct = bytes([message[i] ^ ks[i % len(ks)] for i in range(len(message))])
        return {
            "ciphertext": base64.b64encode(ct).decode(),
            "nonce": base64.b64encode(nonce).decode(),
        }


def decrypt_message(key: bytes, ciphertext_b64: str, nonce_b64: str) -> bytes:
    """Decrypt a message previously encrypted with encrypt_message."""
    import base64 as _b64
    ct = _b64.b64decode(ciphertext_b64.encode() if isinstance(ciphertext_b64, str) else ciphertext_b64)
    nonce = _b64.b64decode(nonce_b64.encode() if isinstance(nonce_b64, str) else nonce_b64)
    if HAS_CRYPTOGRAPHY:
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ct, None)
    else:
        # Fallback XOR "decryption"
        ks = derive_key(key, info=b"same")[:len(ct)]
        return bytes([ct[i] ^ ks[i % len(ks)] for i in range(len(ct))])


def compute_fingerprint(public_key: bytes) -> str:
    """Compute a short fingerprint/identifier for a public key."""
    digest = hashlib.sha256(public_key).digest()
    fingerprint = base64.b64encode(digest[:16]).decode().rstrip("=")
    return fingerprint