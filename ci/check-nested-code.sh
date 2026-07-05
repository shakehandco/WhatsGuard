#!/usr/bin/env bash
#
# Nested-code inventory gate (macOS, release only).
#
# A notarized Electron shell wrapped around an unsigned `llama-server` is NOT a
# secure notarized app. This enumerates every Mach-O in the bundle — main binary,
# Electron frameworks, dylibs, and the llama-server sidecar — and asserts each
# one carries a valid signature, and (when a Team ID is given) that it is OUR
# Developer ID, not someone else's.
#
# Usage:
#   ci/check-nested-code.sh dist/mac-arm64/WhatsGuard.app "$APPLE_TEAM_ID"
set -euo pipefail

APP_PATH="${1:?usage: check-nested-code.sh <path-to-.app> [team-id]}"
TEAM_ID="${2:-${APPLE_TEAM_ID:-}}"

echo "==> recursive strict verification of the bundle"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

echo "==> per-binary inventory"
fail=0
found=0
while IFS= read -r -d '' f; do
  case "$(file -b "$f" 2>/dev/null)" in
    *Mach-O*) ;;
    *) continue ;;
  esac
  found=$((found + 1))
  if ! codesign --verify --strict "$f" 2>/dev/null; then
    echo "::error::unsigned or invalid signature: $f"
    fail=1
    continue
  fi
  if [ -n "$TEAM_ID" ]; then
    tid="$(codesign -dvv "$f" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
    if [ "$tid" != "$TEAM_ID" ]; then
      echo "::error::team identifier mismatch ($tid != $TEAM_ID): $f"
      fail=1
    fi
  fi
done < <(find "$APP_PATH/Contents" -type f -print0)

echo "inspected $found Mach-O file(s)"
if [ "$fail" -ne 0 ]; then
  echo "::error::nested-code inventory FAILED"
  exit 1
fi
echo "nested-code inventory OK"
