#!/usr/bin/env bash
#
# Entitlement allowlist gate.
#
# Asserts that the hardened-runtime entitlements match the committed allowlist
# (ci/expected-release-entitlements.txt) EXACTLY — no silent additions, no
# silent removals. A new entitlement must be a reviewed change to that file.
#
# Accepts either:
#   - a signed .app bundle  -> entitlements read via `codesign` (release CI)
#   - an entitlements .plist -> read directly (PR CI, no signing/secrets needed)
#
# Usage:
#   ci/check-entitlements.sh dist/mac-arm64/WhatsGuard.app
#   ci/check-entitlements.sh build/entitlements.mac.plist
set -euo pipefail

TARGET="${1:?usage: check-entitlements.sh <path-to-.app|.plist> [expected-keys-file]}"
EXPECTED="${2:-ci/expected-release-entitlements.txt}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ -d "$TARGET" ]; then
  # Signed bundle: extract the embedded entitlements (modern codesign → XML).
  codesign -d --entitlements :- "$TARGET" >"$work/ent.plist" 2>/dev/null || true
else
  cp "$TARGET" "$work/ent.plist"
fi

# Normalise to xml1 when plutil is available (no-op on already-XML plists, and
# absent on Linux runners — the source plist is XML so plistlib reads it anyway).
if command -v plutil >/dev/null 2>&1; then
  plutil -convert xml1 "$work/ent.plist" >/dev/null 2>&1 || true
fi

python3 - "$work/ent.plist" <<'PY' | sort -u >"$work/actual.txt"
import plistlib, sys
try:
    with open(sys.argv[1], "rb") as f:
        data = plistlib.load(f)
    for k in data.keys():
        print(k)
except Exception:
    pass
PY

grep -vE '^\s*(#|$)' "$EXPECTED" | sort -u >"$work/expected.txt"

if diff -u "$work/expected.txt" "$work/actual.txt"; then
  echo "entitlement allowlist OK ($(wc -l <"$work/actual.txt" | tr -d ' ') key(s))"
else
  echo "::error::entitlements differ from $EXPECTED"
  echo "  lines marked '-' are expected but MISSING; '+' are present but NOT allowlisted."
  echo "  If a change is intentional and reviewed, update $EXPECTED to match."
  exit 1
fi
