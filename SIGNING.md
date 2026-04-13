# Signing and Notarizing Transcripto (macOS)

To distribute the app outside the Mac App Store without Gatekeeper blocking it, you need to **code sign** and **notarize** the build using an Apple Developer account.

## 1. Apple Developer account

- Enroll at [developer.apple.com](https://developer.apple.com) (paid program).
- Note your **Team ID**: Apple Developer → Membership → Team ID (e.g. `ABC123XYZ`).

## 2. Code signing certificate

1. In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list), create a certificate:
   - **Developer ID Application** — for signing the `.app` (distribution outside App Store).
2. Download and double‑click the certificate to add it to **Keychain Access** (login keychain).
3. In Keychain Access, confirm you see **“Developer ID Application: Your Name (TEAM_ID)”**.

**Local build:** electron-builder will use the first valid “Developer ID Application” identity from your keychain. To pick a specific one, set in `electron-builder.yml` under `mac`:

```yaml
identity: "Developer ID Application: Your Name (TEAM_ID)"
```

**CI / headless:** Export the certificate as a `.p12` (Keychain Access → certificate → Export), then set:

- `CSC_LINK` — path to the `.p12` file (or base64-encoded content).
- `CSC_KEY_PASSWORD` — password you set when exporting the `.p12`.
- Optionally `CSC_NAME` — exact certificate name if you have multiple.

## 3. Notarization (recommended for distribution)

Notarization tells macOS that Apple has checked the app. Without it, users may see “app is from an unidentified developer” or similar.

### App-specific password

1. [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords.
2. Generate a new password and use it only for notarization (e.g. store in a password manager).

### Environment variables

Set these when running the build (e.g. in your shell or CI):

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # from step above
export APPLE_TEAM_ID="ABC123XYZ"  # your Team ID
```

Never commit these. Use `.env` (and add `.env` to `.gitignore`) or CI secrets.

### Build

```bash
pnpm dist
```

electron-builder will sign the app and submit it to Apple for notarization when `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are set. The DMG (and zip) will be notarized and stapled.

## 4. Optional: sign only, no notarization

To only sign and skip notarization (e.g. for local testing), leave `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` unset. The app will be signed but not notarized; Gatekeeper may still warn users.

## 5. Verify

- **Signature:** `codesign -dv --verbose=4 dist-app/Transcripto.app`
- **Notarization:** `spctl -a -vv -t install dist-app/Transcripto.app`  
  Should include: `origin=Developer ID Application: ...` and notarization info.

## References

- [electron-builder: Code signing (macOS)](https://www.electron.build/code-signing-mac)
- [Apple: Notarize macOS software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
