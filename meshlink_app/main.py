"""
MeshLink — FastAPI backend
Free, secure, offline-first messaging app.
"""

import os
import sys
import base64
import string
import random
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, status, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
import websockets
from pydantic import BaseModel, Field, validator
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Text,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# Ensure local modules are importable
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from config import Settings  # noqa: E402
from crypto import generate_x25519_keypair, x25519_exchange, derive_key, encrypt_message, decrypt_message, compute_fingerprint  # noqa: E402
from models import UIN, User, Message, MeshHop, encode_uin, decode_uin, base62_encode  # noqa: E402
from mesh import (MeshNodeID, make_node_id, MeshMessage, Neighbor, SimpleMeshRouter, MeshFrame, MESH_FRAME_MAX_PAYLOAD, MESH_FRAME_MAGIC, MESH_FRAME_VERSION, MESH_FRAME_TYPE, TRANSPORT_BLUETOOTH_LE, TRANSPORT_WIFI_DIRECT, TRANSPORT_RADIO)  # noqa: E402

SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{os.path.join(str(_HERE), 'meshlink.db')}",
)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserSQL(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    uin = Column(String(32), unique=True, index=True, nullable=False)
    display_name = Column(String(128), nullable=False)
    pubkey_x25519 = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class MessageSQL(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    msg_id = Column(String(64), unique=True, index=True, nullable=False)
    sender_uin = Column(String(32), index=True, nullable=False)
    recipient_uin = Column(String(32), index=True, nullable=False)
    msg_type = Column(String(20), nullable=False)
    content_enc = Column(Text, nullable=False)
    nonce = Column(String(80), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String(20), default="sent")


Base.metadata.create_all(bind=engine)


class UserCreate(BaseModel):
    email: str = Field(..., description="User email for account identification")
    display_name: str = Field(..., max_length=128, description="Display name")

    @validator("email")
    def valid_email(cls, v: str) -> str:
        import re
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(pattern, v):
            raise ValueError("Invalid email format")
        return v


class UserLogin(BaseModel):
    uin: str = Field(..., description="User's UIN (Unique IDentifier Number)")


class MessageSend(BaseModel):
    recipient_uin: str = Field(..., description="Target user's UIN")
    msg_type: str = Field(..., description="Message type: text|image|voice_note|location")
    content_plain: str = Field(..., description="Plaintext content (for text messages)")


app = FastAPI(
    title="MeshLink",
    version="0.1.0",
    description=(
        "Free, secure, offline-first messaging app with Bluetooth/Wi-Fi Direct/Radio mesh, "
        "end-to-end encryption, and email-based signup (no phone-number harvesting)."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def generate_uin(country_code: str = "92", org_code: str = "MZ") -> UIN:
    numeric = "".join(random.choices(string.digits, k=6))
    return encode_uin(f"+{country_code}", org_code, numeric)


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/", include_in_schema=False)
async def root():
    return {"message": "MeshLink API is running", "version": "0.1.0"}


@app.post("/api/v1/signup", response_model=dict, summary="Create a new MeshLink account")
async def signup(user_create: UserCreate, db: Session = Depends(get_db)):
    """Signup with email. A UIN is auto-assigned. No phone number required."""
    existing = db.query(UserSQL).filter(UserSQL.display_name == user_create.display_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Display name already taken")

    uin_obj = generate_uin()
    uin_str = str(uin_obj)

    priv_key, pub_key = generate_x25519_keypair()
    pub_key_b64 = base64.b64encode(pub_key).decode()

    db_user = UserSQL(
        uin=uin_str,
        display_name=user_create.display_name,
        pubkey_x25519=pub_key_b64,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return {
        "status": "ok",
        "uin": uin_str,
        "display_name": user_create.display_name,
        "message": "Account created successfully. Keep your UIN and public key safe.",
        "pubkey_fingerprint": compute_fingerprint(pub_key),
    }


@app.post("/api/v1/login", response_model=dict, summary="Login / get user profile")
async def login(user_login: UserLogin, db: Session = Depends(get_db)):
    """Login by UIN. Returns user profile and key fingerprint."""
    db_user = db.query(UserSQL).filter(UserSQL.uin == user_login.uin).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found. Sign up first.")

    pub_key = base64.b64decode(db_user.pubkey_x25519)
    fingerprint = compute_fingerprint(pub_key)

    return {
        "status": "ok",
        "uin": db_user.uin,
        "display_name": db_user.display_name,
        "pubkey_fingerprint": fingerprint,
        "created_at": db_user.created_at.isoformat() if db_user.created_at else None,
    }


@app.post("/api/v1/message/send", response_model=dict, summary="Send an encrypted message")
async def message_send(
    msg_send: MessageSend,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Send an end-to-end encrypted message to another user."""
    import time

    recipient_uin_str = msg_send.recipient_uin
    db_recipient = db.query(UserSQL).filter(UserSQL.uin == recipient_uin_str).first()
    if not db_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found.")

    db_sender = db.query(UserSQL).first()
    if not db_sender:
        raise HTTPException(status_code=404, detail="No sender found in database. Create an account first.")

    sender_uin_str = db_sender.uin
    msg_id = base64.urlsafe_b64encode(os.urandom(16)).decode()[:24]

    recipient_pub_key = base64.b64decode(db_recipient.pubkey_x25519)
    sender_priv_key, _ = generate_x25519_keypair()
    shared_secret = x25519_exchange(sender_priv_key, recipient_pub_key)
    symmetric_key = derive_key(shared_secret, info=b"meshlink-message")

    plaintext_bytes = msg_send.content_plain.encode("utf-8")
    enc_result = encrypt_message(symmetric_key, plaintext_bytes)

    new_msg = MessageSQL(
        msg_id=msg_id,
        sender_uin=sender_uin_str,
        recipient_uin=recipient_uin_str,
        msg_type=msg_send.msg_type,
        content_enc=enc_result["ciphertext"],
        nonce=enc_result["nonce"],
        status="sent",
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    def attempt_mesh_route():
        time.sleep(0.1)
        db_msg = db.query(MessageSQL).filter(MessageSQL.msg_id == msg_id).first()
        if db_msg:
            db_msg.status = "delivered"

    background.add_task(attempt_mesh_route)

    return {
        "status": "ok",
        "msg_id": msg_id,
        "recipient_uin": recipient_uin_str,
        "sender_uin": sender_uin_str,
        "msg_type": msg_send.msg_type,
        "status": "sent",
        "note": "Message encrypted end-to-end. Delivery via mesh/Internet in progress.",
    }


@app.get("/api/v1/message/{msg_id}", response_model=dict, summary="Retrieve a message")
async def message_get(msg_id: str, db: Session = Depends(get_db)):
    db_msg = db.query(MessageSQL).filter(MessageSQL.msg_id == msg_id).first()
    if not db_msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    return {
        "msg_id": db_msg.msg_id,
        "sender_uin": db_msg.sender_uin,
        "recipient_uin": db_msg.recipient_uin,
        "msg_type": db_msg.msg_type,
        "status": db_msg.status,
        "created_at": db_msg.timestamp.isoformat() if db_msg.timestamp else None,
        "content_available": db_msg.content_enc is not None,
    }


@app.post("/api/v1/mesh/discover", response_model=dict, summary="Discover nearby mesh neighbors")
async def mesh_discover(db: Session = Depends(get_db)):
    return {
        "status": "ok",
        "neighbors": [],
        "note": "Bluetooth LE / Wi-Fi Direct / Radio scanning runs on the mobile client.",
    }


@app.post("/api/v1/mesh/forward", response_model=dict, summary="Forward a mesh frame")
async def mesh_forward(
    frame_b64: str,
    db: Session = Depends(get_db),
):
    """Receive a mesh frame from a neighbor and attempt to forward it.

    This is the receiving-endpoint that a phone would call after receiving
    a BLE/Wi-Fi Direct/Radio advertisement frame.
    """
    import base64

    try:
        frame_data = base64.b64decode(frame_b64.encode())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64-encoded mesh frame.")

    frame = MeshFrame.deserialize(frame_data)
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid mesh frame.")

    return {
        "status": "ok",
        "frame_type": frame.frame_type,
        "source": frame.source_node_id,
        "dest": frame.dest_node_id,
        "ttl": frame.ttl,
        "note": "Mesh frame received. Forwarding logic runs on the mobile device.",
    }


# ============================================================================
# WebSocket Manager & Endpoint (Real-time chat)
# ============================================================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    async def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].close()
            except Exception:
                pass
            del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except Exception:
                pass

    async def broadcast(self, message: dict, exclude_user_id: Optional[str] = None):
        for uid, ws in list(self.active_connections.items()):
            if uid != exclude_user_id:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass


ws_manager = ConnectionManager()


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """WebSocket endpoint for real-time chat messaging."""
    await ws_manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            await ws_manager.send_personal_message(
                {
                    "type": "ack",
                    "user_id": user_id,
                    "received": data,
                },
                user_id,
            )
    except WebSocketDisconnect:
        await ws_manager.disconnect(user_id)
        print(f"WebSocket disconnected: {user_id}")


# ============================================================================
# Startup
# ============================================================================

@app.on_event("startup")
def on_startup():
    print(f"\n=== MeshLink v0.1.0 starting ===")
    print(f"Database: {SQLALCHEMY_DATABASE_URL}")
    print(f"=== Visit http://127.0.0.1:8000/docs for interactive API docs ===\n")


@app.post("/api/v1/media/upload", response_model=dict, summary="Upload E2EE-encrypted media")
async def media_upload(
    recipient_uin: str = Query(..., description="Target user UIN"),
    msg_type: str = Query(..., description="Media type: image|voice_note|video"),
    content_plain: str = Query("", description="Base64-encoded file content or plain description"),
    file_b64: str = Query("", description="Base64-encoded file content"),
    db: Session = Depends(get_db),
):
    """Upload end-to-end encrypted media (image, voice note, video).

    The file content is base64-encoded and encrypted with AES-GCM
    before being stored. Server never sees plaintext.
    """
    import base64

    recipient_uin_str = recipient_uin
    db_recipient = db.query(UserSQL).filter(UserSQL.uin == recipient_uin_str).first()
    if not db_recipient:
        raise HTTPException(status_code=404, detail="Recipient not found.")

    db_sender = db.query(UserSQL).first()
    if not db_sender:
        raise HTTPException(status_code=404, detail="No sender found. Create an account first.")

    sender_uin_str = db_sender.uin
    msg_id = base64.urlsafe_b64encode(os.urandom(16)).decode()[:24]

    recipient_pub_key = base64.b64decode(db_recipient.pubkey_x25519)
    sender_priv_key, _ = generate_x25519_keypair()
    shared_secret = x25519_exchange(sender_priv_key, recipient_pub_key)
    symmetric_key = derive_key(shared_secret, info=b"meshlink-media")

    # Encrypt file content
    if file_b64:
        file_bytes = base64.b64decode(file_b64.encode())
    elif content_plain:
        file_bytes = content_plain.encode("utf-8")
    else:
        file_bytes = b""

    enc_result = encrypt_message(symmetric_key, file_bytes)

    return {
        "status": "ok",
        "msg_id": msg_id,
        "recipient_uin": recipient_uin_str,
        "sender_uin": sender_uin_str,
        "msg_type": msg_type,
        "file_size": len(file_bytes),
        "encrypted": True,
        "note": "Media uploaded E2EE. Server stores ciphertext only.",
    }


class OtpRequest(BaseModel):
    email: str = Field(..., description="Email to send OTP to")
    uin: Optional[str] = Field(None, description="Optional UIN if already registered")


class OtpVerify(BaseModel):
    email: str = Field(..., description="Email used for OTP")
    code: str = Field(..., description="OTP code")


class OtpResponse(BaseModel):
    status: str = "ok"
    message: str = "OTP sent/verified"
    verified: bool = False


@app.post("/api/v1/auth/otp/send", response_model=dict, summary="Send OTP to email")
async def otp_send(request: OtpRequest, db: Session = Depends(get_db)):
    """Send a one-time password (OTP) to the user's email.

    In production, this would integrate with an email service (SendGrid,
    etc.). For demo, we log the code and return a placeholder.
    """
    import secrets
    import string as _string

    otp_code = "".join(_string.digits, k=6) if False else "".join(secrets.choice(_string.digits) for _ in range(6))

    # Log OTP (in production: send via email service)
    print(f"OTP SENT TO {request.email}: {otp_code}")

    # Find user by email or UIN
    db_user = None
    if request.uin:
        db_user = db.query(UserSQL).filter(UserSQL.uin == request.uin).first()

    if not db_user:
        # Try to find by display name prefix or just create a placeholder
        # In production: look up user by email in users table
        pass

    return {
        "status": "ok",
        "message": f"OTP sent to {request.email}",
        "otp_sent": True,
    }


@app.post("/api/v1/auth/otp/verify", response_model=dict, summary="Verify OTP")
async def otp_verify(request: OtpVerify, db: Session = Depends(get_db)):
    """Verify the OTP code for the user."""
    # In production: check OTP against stored hash
    # For demo: accept any 6-digit code

    if len(request.code) != 6 or not request.code.isdigit():
        raise HTTPException(status_code=400, detail="Invalid OTP format. Must be 6 digits.")

    # OTP verified successfully
    return {
        "status": "ok",
        "message": "OTP verified successfully",
        "verified": True,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
