#!/usr/bin/env python3
"""
MeshLink — Full Application Test Suite
Tests the backend API and the UI preview end to end.
"""

import json
import sys
import uuid
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"
UI_URL = "http://127.0.0.1:8090/ui-preview.html"
RESULTS = {"passed": 0, "failed": 0}


def log_test(name, passed, detail=""):
    RESULTS["passed" if passed else "failed"] += 1
    print(f"  {'✅ PASS' if passed else '❌ FAIL'}  {name}" + (f"  ({detail})" if detail else ""))


def post_json(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{BASE_URL}{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, json.loads(resp.read().decode())


def get_json(path):
    with urllib.request.urlopen(f"{BASE_URL}{path}", timeout=10) as resp:
        return resp.status, json.loads(resp.read().decode())


def test_health():
    try:
        status, data = get_json("/health")
        log_test("Backend health", status == 200 and data.get("status") == "ok")
    except Exception as e:
        log_test("Backend health", False, str(e))


def test_signup_and_message():
    """Unique display name every run so signup always succeeds."""
    try:
        tag = uuid.uuid4().hex[:8]
        status, data = post_json("/api/v1/signup", {
            "email": f"user_{tag}@example.com",
            "display_name": f"User_{tag}",
        })
        uin = data.get("uin", "")
        log_test("Signup returns 200", status == 200)
        log_test("UIN format (+92-MZ-)", uin.startswith("+92-MZ-"), uin)
        log_test("Fingerprint returned", bool(data.get("pubkey_fingerprint")))

        status, data = post_json("/api/v1/message/send", {
            "recipient_uin": uin,
            "msg_type": "text",
            "content_plain": "Hello MeshLink!",
        })
        log_test("E2EE message send", status == 200 and bool(data.get("msg_id")))
        log_test("Encrypted delivery note", "encrypted" in data.get("note", "").lower())
    except urllib.error.HTTPError as e:
        log_test("Signup + message flow", False, f"HTTP {e.code}: {e.read().decode()[:120]}")
    except Exception as e:
        log_test("Signup + message flow", False, str(e))


def test_invalid_email():
    try:
        post_json("/api/v1/signup", {"email": "not-an-email", "display_name": "Bad"})
        log_test("Invalid email rejected", False, "accepted bad email")
    except urllib.error.HTTPError as e:
        log_test("Invalid email rejected", e.code == 422, f"HTTP {e.code}")
    except Exception as e:
        log_test("Invalid email rejected", False, str(e))


def test_media_upload():
    try:
        tag = uuid.uuid4().hex[:8]
        _, data = post_json("/api/v1/signup", {
            "email": f"media_{tag}@example.com",
            "display_name": f"Media_{tag}",
        })
        uin = data["uin"]
        path = (
            "/api/v1/media/upload?recipient_uin=" + urllib.parse.quote(uin)
            + "&msg_type=image&content_plain=test-image-data"
        )
        status, result = post_json(path, {})
        log_test("E2EE media upload", status == 200 and result.get("encrypted") is True)
    except Exception as e:
        log_test("E2EE media upload", False, str(e))


def test_mesh():
    try:
        status, data = post_json("/api/v1/mesh/discover", {})
        log_test("Mesh discover", status == 200 and data.get("status") == "ok")
    except Exception as e:
        log_test("Mesh discover", False, str(e))


def test_otp():
    try:
        status, data = post_json("/api/v1/auth/otp/send", {
            "email": "otp@example.com", "uin": "+92-MZ-000001",
        })
        log_test("OTP send", status == 200 and data.get("otp_sent") is True)

        status, data = post_json("/api/v1/auth/otp/verify", {
            "email": "otp@example.com", "code": "123456",
        })
        log_test("OTP verify", status == 200 and data.get("verified") is True)
    except Exception as e:
        log_test("OTP flow", False, str(e))


def test_ui():
    try:
        with urllib.request.urlopen(UI_URL, timeout=10) as resp:
            html = resp.read().decode()
        log_test("UI preview loads", resp.status == 200)
        log_test("Purple theme (#6750A4)", "#6750A4" in html)
        log_test("Signup form present", "signup" in html.lower())
        log_test("UIN card present", "uin" in html.lower())
    except Exception as e:
        log_test("UI preview", False, str(e))


def main():
    print("=" * 62)
    print("   MESHLINK — FULL APPLICATION TEST SUITE")
    print("=" * 62)
    print("\n📡 BACKEND")
    print("-" * 62)
    test_health()
    test_signup_and_message()
    test_invalid_email()
    test_media_upload()
    test_mesh()
    test_otp()
    print("\n🎨 UI")
    print("-" * 62)
    test_ui()
    print("\n" + "=" * 62)
    print(f"   RESULTS: {RESULTS['passed']} passed, {RESULTS['failed']} failed")
    print("=" * 62)
    return 0 if RESULTS["failed"] == 0 else 1


if __name__ == "__main__":
    import urllib.parse  # noqa: E402
    sys.exit(main())
