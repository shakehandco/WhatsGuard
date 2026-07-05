# macOS release & auto-update runbook

How WhatsGuard is signed, notarized, distributed, and updated on macOS — and the
one-time setup a maintainer must do before the first automated release.

## Trust model

WhatsGuard ships as a Developer ID app distributed outside the Mac App Store and
updates itself with [`electron-updater`](https://www.electron.build/auto-update)
(Squirrel.Mac under the hood). There is **no Sparkle and no EdDSA key**:

- **Install/launch** is gated by Apple — Developer ID code signature + hardened
  runtime + notarization + stapled ticket → silent Gatekeeper.
- **Updates** are gated by your **code signature** (Squirrel.Mac refuses an
  update whose signature doesn't match the installed app) plus the **SHA-512 in
  `latest-mac.yml`**, which `electron-updater` checks against the downloaded
  bytes.

So update security rides entirely on the release pipeline producing **immutable,
correctly-signed artifacts**.

## Immutable release order

The single most important rule — never mutate an artifact after its hash is
recorded in `latest-mac.yml`:

```
build → sign app + ALL nested executables → notarize → staple
      → VERIFY (signature, entitlements, nested code, Gatekeeper)
      → record SHA-256 → publish those exact bytes
```

[`.github/workflows/release.yml`](../.github/workflows/release.yml) builds with
`--publish never`, runs every gate, and only then uploads the dmg, zip,
`latest-mac.yml`, and blockmaps to the GitHub release.

**What gets stapled:** electron-builder notarizes and staples the **`.app`**,
then packages it — the zip just wraps the stapled app, and the dmg (unsigned by
default) merely contains it. This is Apple's recommended pattern. We deliberately
do **not** staple the dmg or zip:

- a `.zip` cannot be stapled at all (you staple the app inside it, which
  electron-builder already did before zipping);
- stapling the dmg would rewrite its bytes and break the SHA-512/size recorded
  in `latest-mac.yml`, killing auto-update.

So the `.app` is the authoritative artifact the release job validates. (A
notarized app inside an unsigned dmg passes Gatekeeper online; offline
first-install would need a stapled dmg — out of scope for our online users.)

## One-time setup (manual — not automated)

These are deliberately human-only steps.

### 1. Apple Developer ID Application certificate

1. Join the Apple Developer Program.
2. Create a **Developer ID Application** certificate (a Developer ID *Installer*
   cert is only needed for `.pkg`, which we don't ship).
3. Export it as a password-protected `.p12`, then base64-encode it:
   ```sh
   base64 -i DeveloperID.p12 | pbcopy
   ```

### 2. App Store Connect API key (for non-interactive notarization)

In App Store Connect → Users and Access → Integrations, create an API key with
the **Developer** role. Save the `.p8`, the **Key ID**, and the **Issuer ID**.

### 3. GitHub `production-release` environment

Create an environment named **`production-release`** with:

- a **required reviewer** and **self-review disabled** (secrets stay withheld
  until a human approves the run);
- deployment branch/tag rule restricting it to protected `v*` tags.

Add these **environment secrets**:

| Secret | Value |
| --- | --- |
| `MACOS_CERTIFICATE_P12_BASE64` | base64 of the Developer ID `.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | the `.p12` export password |
| `APPLE_API_PRIVATE_KEY` | contents of the App Store Connect `.p8` |
| `APPLE_API_KEY_ID` | API Key ID |
| `APPLE_API_ISSUER_ID` | API Issuer ID |
| `APPLE_TEAM_ID` | your Apple Team ID |

> electron-builder imports `CSC_LINK`/`CSC_KEY_PASSWORD` into its own temporary
> keychain and cleans it up — no `MACOS_KEYCHAIN_PASSWORD` is needed.

### 4. Protect the pipeline

- Add **CODEOWNERS** on `.github/**` and `ci/**` so workflow changes require
  review.
- **Pin third-party actions to full commit SHAs** (the workflows currently use
  tags + a `TODO`; tighten before production).
- Keep `contents: read` as the default; only the release job gets
  `contents: write`.

## Cutting a release

```sh
# 1. bump the version
npm version patch        # or minor / major — updates package.json + tags

# 2. push the tag (must be vX.Y.Z and match package.json)
git push origin main --follow-tags
```

Pushing a `v*` tag triggers `release.yml`. It first asserts the tag matches
`package.json` version, then runs the build + gates, waits for environment
approval, and publishes. You can also trigger it via **workflow_dispatch** from a
tag ref.

## The verification gates

| Gate | Where | What it enforces |
| --- | --- | --- |
| Typecheck + unit tests | `ci.yml` (every PR) | correctness |
| Unsigned packaging smoke | `ci.yml` (every PR) | electron-builder config builds |
| Entitlement allowlist (source) | `ci.yml` | new entitlement in the plist fails until reviewed |
| Developer ID signature | `release.yml` | `codesign --verify --deep --strict` |
| Entitlement allowlist (signed) | `release.yml` | signed app entitlements == [`ci/expected-release-entitlements.txt`](../ci/expected-release-entitlements.txt) |
| Nested-code inventory | `release.yml` | every Mach-O incl. `llama-server` is signed by our Team ID |
| Gatekeeper + staple | `release.yml` | `stapler validate` the **app** + `spctl` assessment (dmg/zip are not stapled — see above) |

The allowlist and inventory scripts are reusable:

```sh
ci/check-entitlements.sh dist/mac-arm64/WhatsGuard.app   # or build/entitlements.mac.plist
ci/check-nested-code.sh  dist/mac-arm64/WhatsGuard.app "$APPLE_TEAM_ID"
```

## Entitlements: known debt

[`build/entitlements.mac.plist`](../build/entitlements.mac.plist) enables four
hardened-runtime *weakening* entitlements
(`disable-library-validation`, `allow-unsigned-executable-memory`, `allow-jit`,
`allow-dyld-environment-variables`). They exist **only** because the bundled
`llama-server` and its dylibs are not yet signed with our Developer ID.

**Remediation:** sign the sidecar as part of the bundle, then drop at least
`disable-library-validation` and `allow-dyld-environment-variables` and remove
them from [`ci/expected-release-entitlements.txt`](../ci/expected-release-entitlements.txt).
The allowlist gate will hold the line until then.

## Troubleshooting

- **Notarization rejected** — inspect the log:
  `xcrun notarytool log <submission-id> --key … --key-id … --issuer …`. Usually
  an unsigned nested binary or a missing hardened-runtime flag.
- **Entitlement gate fails** — the signed app's entitlements drifted from the
  allowlist. If intentional and reviewed, update the allowlist; otherwise fix
  the entitlements plist.
- **Nested-code inventory fails** — a binary (typically `llama-server`) is
  unsigned or signed by the wrong team. Ensure it is inside the bundle so
  electron-builder deep-signs it.
- **Update never offered** — confirm the release has a `zip` asset and a
  `latest-mac.yml`, served over HTTPS, and that the new build's signature/Team
  ID matches the installed app. A dmg-only release cannot auto-update.
- **"Could not get code signature" on update** — bytes changed after
  `latest-mac.yml` was generated. Re-release; never re-zip, re-sign, or
  **staple the dmg** after the feed is generated (stapling the dmg rewrites it).

## Clean-machine acceptance

CI gates are not a substitute for a real download test. Before announcing a
release, download the dmg on a **clean Mac or VM** (so it gets a quarantine
attribute), install, and confirm:

- it launches with no Gatekeeper prompt;
- auto-update from the previous production version succeeds;
- a deliberately bad/rolled-back update is rejected.
