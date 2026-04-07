# Transcripto: macOS Code Signing & Notarization Guide

This guide walks you through signing and notarizing the Transcripto Electron app for distribution outside the Mac App Store.

## Prerequisites

- macOS machine with Xcode Command Line Tools installed
- Apple Developer Program membership ($99/year) under the account: **Christian Schlaiss**
- The **"Developer ID Application"** certificate installed in your Keychain (already created)

---

## Step 1: Install the Intermediate Certificate

Your "Developer ID Application" certificate will show as "not trusted" until you install Apple's intermediate certificate. Download and install it:

1. Download: https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
2. Double-click the downloaded `.cer` file to install it into your Keychain

Verify everything is working by running this in Terminal:

```bash
security find-identity -v -p codesigning
```

You should see a line like:

```
"Developer ID Application: Christian Schlaiss (GD6MGSB73Q)" — 1 valid identity found
```

If it says **0 valid identities**, the intermediate certificate is missing or the Developer ID cert isn't installed.

---

## Step 2: Generate an App-Specific Password

Apple requires this for notarization (so the build tool can authenticate without triggering 2FA).

1. Go to [account.apple.com](https://account.apple.com)
2. Sign in with the **Apple Developer account** 
3. Go to **Sign-In and Security** > **App-Specific Passwords**
4. Click **"Generate an app-specific password"**
5. Label it something like `Transcripto notarization`
6. Copy the generated password (format: `xxxx-xxxx-xxxx-xxxx`) — save it somewhere safe, you won't be able to see it again

---

## Step 3: Clone and Set Up the Project

```bash
git clone <repo-url>
cd transcripto
pnpm install
```

---

## Step 4: Build, Sign & Notarize

Set the three environment variables and run the build:

```bash
export APPLE_ID="<your-apple-developer-email>"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="GD6MGSB73Q"

pnpm dist
```

This will:
1. Build the renderer (Vite) and main process (TypeScript)
2. Package the Electron app with electron-builder
3. **Sign** the `.app` bundle with your Developer ID Application certificate
4. **Notarize** — upload to Apple's Notary Service for malware scanning
5. **Staple** the notarization ticket to the app
6. Produce a signed `.dmg` and `.zip` in `dist-app/`

The first notarization may take a while (up to a few hours). Subsequent builds typically take 5-15 minutes.

---

## Step 5: Verify the Signed App

After the build completes, verify everything is correct:

```bash
# Check code signature
codesign -vvv --deep --strict dist-app/mac-arm64/Transcripto.app

# Check signing identity
codesign -dvv dist-app/mac-arm64/Transcripto.app

# Verify Gatekeeper accepts it
spctl -a -vvv dist-app/mac-arm64/Transcripto.app

# Verify notarization ticket is stapled
xcrun stapler validate dist-app/mac-arm64/Transcripto.app
```

Expected output for `spctl`:
```
dist-app/mac-arm64/Transcripto.app: accepted
source=Developer ID
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Certificate shows "not trusted" in Keychain | Install the intermediate certificate from Step 1 |
| `0 valid identities found` | The Developer ID Application certificate is not in your Keychain — re-download it from developer.apple.com/account/resources/certificates |
| Notarization fails with auth error | Double-check APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID are correct |
| Notarization fails with "invalid signature" | Make sure `hardenedRuntime: true` is set in electron-builder.yml (it is) |
| "App is damaged" on another Mac | The DMG/ZIP wasn't stapled — re-run `xcrun stapler staple dist-app/Transcripto-*.dmg` |
| Build succeeds but skips notarization | The environment variables aren't set — check for typos |

---

## Output Files

After a successful build, the distributable files are in `dist-app/`:

- `Transcripto-<version>-arm64.dmg` — Disk image for distribution
- `Transcripto-<version>-arm64-mac.zip` — ZIP archive for Sparkle auto-updates or direct download

Either file can be distributed to users. They will install and run without any Gatekeeper warnings.
