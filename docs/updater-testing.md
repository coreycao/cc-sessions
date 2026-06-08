# Updater Testing

CC Sessions uses three updater test levels. Prefer the fastest level that covers the risk you are changing.

## 1. Unit Tests

Use this for updater state mapping, timeout handling, and wrapper behavior.

```bash
pnpm test:frontend
```

The updater tests mock `@tauri-apps/plugin-updater`, so they do not require a signed app bundle or network access.

## 2. Dev Mock UI Tests

Use this while working on Settings UI states.

```bash
pnpm tauri dev
```

In development builds, Settings > App shows `Dev updater mock`. Use the mock modes to test:

- Update available
- Up to date
- Check timeout
- Check failed
- Download failed
- Real updater

This mode verifies the user flow and visual states. It does not verify Tauri's signed updater replacement logic.

## 3. Local Signed Updater E2E

Use this before publishing release changes. It builds a local `1.0.1` signed update artifact, serves a local `latest.json`, builds a local `1.0.0` app pointed at that local endpoint, and opens the old app for manual update testing.

```bash
pnpm updater:e2e:local
```

The script requires `.tauri-keys/updater.key` or `TAURI_SIGNING_PRIVATE_KEY` in the environment. Keep the script running while testing because it serves the local updater metadata and artifact.
It can run with local uncommitted changes, so this is the normal loop for testing updater fixes before release.

Expected flow:

1. The script opens `.dev-updater/apps/CC Sessions 1.0.0.app`.
2. Open Settings > App.
3. Check for updates.
4. The app should find `1.0.1`.
5. Install the update.
6. The app should download the signed local artifact and relaunch.

Useful environment variables:

```bash
UPDATER_E2E_PORT=48765
UPDATER_E2E_OLD_VERSION=1.0.0
UPDATER_E2E_NEW_VERSION=1.0.1
UPDATER_E2E_TARGET=x86_64-apple-darwin
```

Use `UPDATER_E2E_TARGET=aarch64-apple-darwin` on an Apple Silicon Mac to prepare and test native arm64 updater metadata.

To only build and prepare the local artifacts without opening the app or starting the local server:

```bash
pnpm updater:e2e:local --prepare-only
```

To reuse already prepared artifacts and start the manual test without rebuilding:

```bash
pnpm updater:e2e:local --serve-prepared
```

## GitHub Release Testing

Only use GitHub Releases for final release validation. Do not use production releases as the normal updater debugging loop.

Before publishing:

```bash
pnpm test
pnpm updater:e2e:local
```
