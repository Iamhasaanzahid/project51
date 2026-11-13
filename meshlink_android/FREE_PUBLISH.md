# MeshLink — Publish 100% Free (No $25 required)

Google Play costs a **one-time $25** developer fee. If you want **truly zero cost**,
use one of these free channels. You can do all of them.

---

## Option A — F-Droid (free & open source store) ✅ Recommended free option

F-Droid is a free Android app store. **No fees, no account cost.**

1. Build the APK (see below, or let GitHub Actions build it).
2. Create a public Git repo containing `meshlink_android/`.
3. Add F-Droid metadata at `metadata/com.meshlink.app.yml`:

```yaml
Categories:
  - Internet
  - Security
License: GPL-3.0-or-later
AuthorName: MeshLink
AuthorEmail: you@example.com
SourceCode: https://github.com/YOURNAME/meshlink
IssueTracker: https://github.com/YOURNAME/meshlink/issues

AutoName: MeshLink
Summary: Free end-to-end encrypted messenger that works offline
Description: |
  MeshLink is a free, secure, offline-first messenger.
  Sign up with email only — no phone number.
  Messages are end-to-end encrypted and can travel over
  Bluetooth, Wi-Fi Direct and mesh relays when there is no internet.

RepoType: git
Repo: https://github.com/YOURNAME/meshlink

Builds:
  - versionName: 1.0.0
    versionCode: 1
    commit: v1.0.0
    subdir: meshlink_android
    gradle:
      - yes

AutoUpdateMode: Version
UpdateCheckMode: Tags
CurrentVersion: 1.0.0
CurrentVersionCode: 1
```

4. Submit a merge request to https://gitlab.com/fdroid/fdroiddata
   (free, reviewed by volunteers).

---

## Option B — Direct APK download (100% free, instant)

1. Build a **signed release APK** (or use the debug APK for testing).
2. Upload it anywhere free: GitHub Releases, GitLab Releases, SourceForge.
3. Share the link. Users enable "Install unknown apps" and install.

### Build + sign locally

```bash
# 1. Create a keystore (free, do this once)
keytool -genkey -v -keystore meshlink-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias meshlink -storepass YOUR_PASSWORD -keypass YOUR_PASSWORD \
  -dname "CN=MeshLink, OU=Dev, O=MeshLink, L=City, S=State, C=PK"

# 2. Build signed APK
cd meshlink_android
gradle assembleRelease \
  -Pandroid.injected.signing.store.file=../meshlink-release.jks \
  -Pandroid.injected.signing.store.password=YOUR_PASSWORD \
  -Pandroid.injected.signing.key.alias=meshlink \
  -Pandroid.injected.signing.key.password=YOUR_PASSWORD \
  -PmeshlinkApiUrl="https://your-free-host.onrender.com"

# APK: app/build/outputs/apk/release/app-release.apk
```

Keep `meshlink-release.jks` and its password safe — you need them for every future update.

---

## Option C — Amazon Appstore (free to submit)

- Free developer account, no listing fee.
- Upload the same signed APK at https://developer.amazon.com/apps-and-games

---

## Option D — Google Play ($25 one-time, optional)

Only do this if you specifically want Play Store distribution.

1. Register: https://play.google.com/console — **$25 one-time**, no monthly fee.
2. Build a **signed AAB**:

```bash
cd meshlink_android
gradle bundleRelease -PmeshlinkApiUrl="https://your-free-host.onrender.com"
# → app/build/outputs/bundle/release/app-release.aab
```

3. In Play Console: Create app → Upload AAB → fill listing → submit.
4. Review usually takes 1–3 days. Publishing itself is free.

**Cost summary**

| Channel        | Cost        | Review      |
|----------------|-------------|-------------|
| F-Droid        | Free        | Volunteer   |
| Direct APK     | Free        | None        |
| Amazon         | Free        | 1–2 days    |
| Google Play    | $25 once    | 1–3 days    |

---

## Build in the cloud for free (no Android SDK needed locally)

This repo includes `.github/workflows/android-build.yml`.
Push to GitHub → **Actions** tab → run **Build MeshLink APK** → download the APK artifact.
GitHub Actions is free for public repositories.

---

## App icons / graphics for any store

- App icon: 512×512 PNG
- Feature graphic (Play only): 1024×500 PNG
- Screenshots: at least 2 (use the purple UI preview)

You can generate them from the existing purple theme (`#6750A4`).
