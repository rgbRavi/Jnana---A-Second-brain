# Release signing & notarization

> **Status: not yet configured — requires certificates only the project owner can obtain.**
> Unsigned builds still run, but macOS Gatekeeper blocks first launch and Windows SmartScreen warns
> on the installer. This doc is the checklist to make signed releases; nothing here is wired up yet.

Signing is **not** done in the regular [CI workflow](.github/workflows/ci.yml) (that only builds to
prove the bundles compile). It belongs in a separate, tag-triggered release workflow that has the
signing secrets. Add that workflow when the certificates below are in hand.

---

## Windows (Authenticode)

You need a code-signing certificate. Options, cheapest-effort first:

1. **Azure Trusted Signing** (recommended for new projects) — no physical token, cloud-based.
2. **OV/EV certificate** from a CA (DigiCert, Sectigo, …). EV clears SmartScreen reputation faster;
   OV builds reputation over downloads.

### Configure Tauri
Set the signing command/thumbprint under `bundle.windows` in
[src-tauri/tauri.conf.json](src-tauri/tauri.conf.json). For a locally-installed cert:

```json
"bundle": {
  "windows": {
    "certificateThumbprint": "YOUR_CERT_SHA1_THUMBPRINT",
    "digestAlgorithm": "sha256",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

For Azure Trusted Signing use a `signCommand` invoking `trusted-signing-cli` / `azuresigntool`
instead of `certificateThumbprint`. Keep the actual secret out of the repo — pass it via CI secrets.

---

## macOS (Developer ID + notarization)

You need an Apple Developer account ($99/yr) and a **Developer ID Application** certificate.

Provide these to the build environment (CI secrets, never committed):

| Variable | Meaning |
|---|---|
| `APPLE_CERTIFICATE` | base64 of the `.p12` Developer ID Application cert |
| `APPLE_CERTIFICATE_PASSWORD` | password for that `.p12` |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` / `APPLE_PASSWORD` | Apple ID + app-specific password for notarization |
| `APPLE_TEAM_ID` | your 10-char team id |

Tauri picks these up automatically during `tauri build` and notarizes + staples the `.dmg`/`.app`.

---

## Release workflow (to add)

A `release.yml` triggered on `v*` tags should, per-OS, run the signed `tauri build` with the secrets
above in `env`, then upload the artifacts. `tauri-apps/tauri-action` handles the build + GitHub Release
upload; wire the signing env into its step. Until the certs exist, keep releases marked pre-release and
document the manual "right-click → Open" (macOS) / "More info → Run anyway" (Windows) workaround in the
release notes.

---

## Auto-updater (blocked on the above)

The Tauri updater needs a signing **keypair** (`tauri signer generate`) and a hosted `latest.json`
endpoint; the public key goes in `tauri.conf.json` and each release is signed with the private key
(a CI secret). It's independent of the OS code-signing certs above but shares the same "needs secrets +
a release pipeline" prerequisite. Until then, updates are manual — see **Updating** in the
[README](README.md).
