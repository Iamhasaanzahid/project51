# MeshLink — F-Droid submission package

Everything F-Droid needs is prepared. **One manual step remains** (account-bound):
the final merge request to F-Droid's `fdroiddata` repo must be opened from your
own GitLab account, because it has to point at *your* public source repo.

---

## What is already prepared

| File | Purpose |
|------|---------|
| `meshlink_android/metadata/com.meshlink.app.yml` | F-Droid build recipe |
| `meshlink_android/LICENSE` | GPL-3.0-or-later (required by F-Droid) |
| `meshlink_android/README.md` | Source repo readme |
| `meshlink_android/CHANGELOG.md` | Release notes |
| `.github/workflows/android-build.yml` | Free APK build in CI |
| Debug/release APKs | Produced by Gradle or GitHub Actions |

---

## Step 1 — Publish the source on GitHub (free)

```bash
cd "/home/mhzaly/Documents/Default Project"
git init                      # if not already a repo
git add .
git commit -m "MeshLink v1.0.0 — radio mesh messenger"
git branch -M main
git remote add origin https://github.com/YOURNAME/meshlink.git
git push -u origin main
git tag v1.0.0
git push origin v1.0.0
```

F-Droid requires:
- public source repo ✅
- OSI license ✅ (GPL-3.0-or-later)
- reproducible build from source ✅ (no prebuilt binaries)
- HTTPS-only network access ✅ (release default is HTTPS)
- no tracking/ads ✅

## Step 2 — Update the metadata with your real URL

Edit `meshlink_android/metadata/com.meshlink.app.yml`:

```yaml
SourceCode: https://github.com/YOURNAME/meshlink
IssueTracker: https://github.com/YOURNAME/meshlink/issues
Changelog: https://github.com/YOURNAME/meshlink/blob/main/CHANGELOG.md
Repo: https://github.com/YOURNAME/meshlink
```

## Step 3 — Verify the build recipe locally (optional)

```bash
# F-Droid will run exactly this in its buildserver:
cd meshlink_android
gradle assembleRelease
```

If it builds here, it builds on F-Droid.

## Step 4 — Fork `fdroiddata` and add the recipe

1. Fork https://gitlab.com/fdroid/fdroiddata (free GitLab account).
2. Copy the metadata file to `metadata/com.meshlink.app.yml` in the fork.
3. Commit and open a Merge Request titled `New app: MeshLink`.
4. Answer the reviewer's checks in the MR thread.

That MR is the only account-bound step. Review usually takes **days to a few
weeks** and is done by volunteers.

## Step 5 — After acceptance

- App appears at `https://f-droid.org/packages/com.meshlink.app/`
- F-Droid auto-builds every tagged release (`AutoUpdateMode: Version`)
- Zero cost, forever

---

## Quick alternative that is live immediately

While F-Droid review runs, ship the same APK directly:

```bash
cd meshlink_android
gradle assembleRelease -PmeshlinkApiUrl="https://your-host.onrender.com"
# upload app/build/outputs/apk/release/app-release.apk to GitHub Releases
```

Users install it with "Install unknown apps" enabled. No store, no fee, no wait.
