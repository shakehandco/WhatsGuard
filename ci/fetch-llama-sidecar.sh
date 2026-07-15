#!/usr/bin/env bash
#
# Fetch the llama.cpp sidecar for a platform into resources/bin.
#
# The sidecar binaries are deliberately not in git (see .gitignore), so every
# build — local or CI — obtains them here. Without this, a release build
# silently produces an app with NO llama-server: nothing fails, the bundle just
# ships without an inference engine and dies at runtime with
# "llama-server binary missing".
#
# Both the upstream build tag AND the archive's SHA-256 are pinned. Tracking
# "latest" would be a supply-chain hole and would swap the inference runtime
# under the app without a test pass.
#
# The archive's libraries are copied WHOLESALE, never hand-picked. Curating that
# list is exactly how we shipped a Windows build missing llama-common.dll: with
# it absent from the app directory, the loader bound a mismatched copy from
# elsewhere on the DLL search path and llama-server died instantly with
# STATUS_ENTRYPOINT_NOT_FOUND (0xC0000139). electron-builder does the final
# platform filtering (see the mac/win extraResources blocks).
#
# Usage: ci/fetch-llama-sidecar.sh [mac|win]      (defaults to the host OS)

set -euo pipefail

# Pinned per platform. macOS and Windows sit on DIFFERENT builds on purpose:
# each is the version that platform has actually been tested against. Bump them
# deliberately, with a test pass — never casually, and never to "latest".
MAC_BUILD=b9581
MAC_ASSET="llama-${MAC_BUILD}-bin-macos-arm64.tar.gz"
MAC_SHA256=d0723ba316d7038e48154cf9279e637faf8b696ec505b4ffcb699f7bc95fcc29

WIN_BUILD=b9987
WIN_ASSET="llama-${WIN_BUILD}-bin-win-cpu-x64.zip"
WIN_SHA256=6847d537b3cd5099051989d08c7eca4296e7a0f1755dbf0540c82e37768320f3

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$REPO_ROOT/resources/bin"

case "${1:-$(uname -s)}" in
  mac | Darwin) PLATFORM=mac ;;
  win | Windows* | MINGW* | MSYS* | CYGWIN*) PLATFORM=win ;;
  *)
    echo "error: unsupported platform '${1:-$(uname -s)}' (expected mac|win)" >&2
    exit 1
    ;;
esac

if [ "$PLATFORM" = mac ]; then
  BUILD=$MAC_BUILD ASSET=$MAC_ASSET SHA256=$MAC_SHA256
else
  BUILD=$WIN_BUILD ASSET=$WIN_ASSET SHA256=$WIN_SHA256
fi

URL="https://github.com/ggml-org/llama.cpp/releases/download/${BUILD}/${ASSET}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> fetching $ASSET ($PLATFORM, llama.cpp $BUILD)"
curl -fsSL --retry 3 -o "$WORK/$ASSET" "$URL"

# Verify BEFORE unpacking: never unpack, let alone execute, unverified bytes.
echo "==> verifying SHA-256"
ACTUAL="$(shasum -a 256 "$WORK/$ASSET" | awk '{print $1}')"
if [ "$ACTUAL" != "$SHA256" ]; then
  echo "error: checksum mismatch for $ASSET" >&2
  echo "  expected: $SHA256" >&2
  echo "  actual:   $ACTUAL" >&2
  exit 1
fi

echo "==> unpacking"
mkdir -p "$WORK/x" "$DEST"
if [ "$PLATFORM" = mac ]; then
  tar xzf "$WORK/$ASSET" -C "$WORK/x"
else
  unzip -q "$WORK/$ASSET" -d "$WORK/x"
fi

# The archive may or may not have a top-level directory; find the dir holding
# the server binary rather than assuming a layout that upstream can change.
SERVER_NAME=$([ "$PLATFORM" = mac ] && echo llama-server || echo llama-server.exe)
SRC="$(dirname "$(find "$WORK/x" -name "$SERVER_NAME" -type f | head -1)")"
if [ ! -d "$SRC" ] || [ ! -f "$SRC/$SERVER_NAME" ]; then
  echo "error: $SERVER_NAME not found in $ASSET" >&2
  exit 1
fi

echo "==> installing into resources/bin"
cp "$SRC/$SERVER_NAME" "$DEST/"
if [ "$PLATFORM" = mac ]; then
  # Preserve the symlink farm (libfoo.dylib -> libfoo.0.dylib -> libfoo.0.1.2.dylib);
  # the install_name references resolve through it.
  cp -R "$SRC"/*.dylib "$DEST/"
  chmod +x "$DEST/$SERVER_NAME"
else
  # Every DLL: llama-server.exe imports llama-server-impl -> llama-common /
  # llama / ggml / mtmd, and ggml additionally picks a ggml-cpu-*.dll kernel by
  # dynamic load at runtime (so it never appears in any import table).
  cp "$SRC"/*.dll "$DEST/"
fi

# The vendor's full library set is kept, including the ~4.5MB of *-impl.dll
# private to CLI tools we don't ship. Trimming them would re-introduce exactly
# the curation that dropped llama-common.dll — not worth 4% of an installer
# that downloads a 5GB model on first run.
echo "==> done: $(ls "$DEST" | grep -cE '\.(dll|dylib)$') libraries + $SERVER_NAME"

# Smoke-test only when the binary is runnable here (a win fetch on a mac dev
# box can't exec the .exe, and that's fine — CI runs each on its own runner).
if [ "$PLATFORM" = mac ] && [ "$(uname -s)" = Darwin ]; then
  "$DEST/$SERVER_NAME" --version 2>&1 | head -2
elif [ "$PLATFORM" = win ] && [ "${OS:-}" = Windows_NT ]; then
  "$DEST/$SERVER_NAME" --version 2>&1 | head -2
fi
