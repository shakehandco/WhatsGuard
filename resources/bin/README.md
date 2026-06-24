# Native binaries

The platform `llama-server` binary is placed here at build time (and is
git-ignored). On macOS it must be the Apple-Silicon/Intel build of llama.cpp's
server; electron-builder deep-signs it with `build/entitlements.mac.plist` so
the Metal backend survives the hardened runtime.

Expected file: `llama-server` (macOS/Linux) or `llama-server.exe` (Windows).
