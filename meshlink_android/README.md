# MeshLink (Android)

Free, secure, offline-first messenger. Sign up with **email only** — no phone
number required. Every device gets an auto-assigned **UIN** (e.g. `+92-MZ-123456`).

Messages are **end-to-end encrypted** (X25519 ECDH + HKDF-SHA256 + AES-256-GCM)
and can travel over three real radios with no internet:

| Transport | Radio | Needs | Typical range |
|-----------|-------|-------|---------------|
| **Radio (SMS)** | Cellular modem (GSM/CDMA/LTE/5G) | SIM + operator signal | city / nationwide |
| **Bluetooth LE** | 2.4 GHz BLE | nothing | 10–50 m per hop |
| **Wi-Fi Direct** | 2.4/5 GHz Wi-Fi | nothing | 50–200 m per hop |

Multi-hop TTL forwarding (default 5 hops) extends the local mesh.

> A plain FM radio receiver cannot transmit data, so the app uses the cellular
> modem — the phone radio that can both send and receive — for long-range radio
> messaging. This works even when mobile data and Wi-Fi are off.

### Addressing over the cellular radio

Your **UIN is your permanent identity**. To message someone over the cellular
radio, the two of you exchange your **radio number** (the SIM number) once, just
like sharing a contact. After that, MeshLink can deliver encrypted messages over
SMS with no internet. Destinations that look like a phone number
(`+923001234567`) automatically go over the cellular radio; UIN destinations use
Bluetooth LE / Wi-Fi Direct / the internet relay.

## Build (free, no Android SDK needed locally)

```bash
# Debug APK
./gradlew assembleDebug

# Release APK/AAB pointing at your own server
./gradlew assembleRelease -PmeshlinkApiUrl="https://your-host.onrender.com"
```

Or push to GitHub and use the included
`.github/workflows/android-build.yml` (free for public repos).

## Backend

The optional internet relay lives in `../meshlink_app` (FastAPI + SQLite).
Offline radio/BLE/Wi-Fi Direct messaging works without it.

## License

GPL-3.0-or-later. See `LICENSE`.

## F-Droid

See `../meshlink_android/FREE_PUBLISH.md` and `metadata/com.meshlink.app.yml`.
