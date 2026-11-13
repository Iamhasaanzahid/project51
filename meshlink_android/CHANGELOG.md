# Changelog

## 1.0.0 — 2026-11-13

First public release.

### Added
- Email-only signup with auto-assigned UIN (`+92-MZ-NNNNNN`)
- End-to-end encryption: X25519 ECDH + HKDF-SHA256 + AES-256-GCM
- **Radio transport (cellular/SMS)** — real phone radio, works with no internet
- **Bluetooth LE transport** — local 2.4 GHz mesh with multi-hop TTL
- **Wi-Fi Direct transport** — higher-throughput local mesh
- Mesh relay with deduplication and 5-hop TTL forwarding
- Encrypted media upload (images, voice notes)
- OTP verification flow
- Optional internet relay (FastAPI + SQLite backend)
- Purple Material 3 UI
- Foreground mesh service + boot restart
- Free hosting (Render/Railway/Fly/Oracle) and free publishing (F-Droid/APK) docs

### Security
- Server stores only ciphertext
- Message payloads chunked and encrypted before leaving the device
- No ads, no trackers, no analytics
