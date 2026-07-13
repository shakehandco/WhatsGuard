# Native binaries

The platform `llama-server` binary is placed here at build time (and is
git-ignored). On macOS it must be the Apple-Silicon/Intel build of llama.cpp's
server; electron-builder deep-signs it with `build/entitlements.mac.plist` so
the Metal backend survives the hardened runtime.

Expected file: `llama-server` (macOS/Linux) or `llama-server.exe` (Windows).

## Windows

Use the official prebuilt Windows x64 **CPU** package from
[llama.cpp releases](https://github.com/ggml-org/llama.cpp/releases)
(`llama-<build>-bin-win-cpu-x64.zip`) — the CPU backend runs everywhere; a
Vulkan/CUDA variant can replace it later for GPU acceleration. Copy
`llama-server.exe` **and every `*.dll` next to it** into this directory:
unlike the static macOS binary, the Windows build dynamically loads
`llama.dll`/`ggml*.dll` at runtime. All of these are git-ignored and picked up
by the `extraResources` glob in `electron-builder.yml`.

## Signing (macOS)

Because this binary lands inside the `.app`, electron-builder deep-signs it with
our Developer ID and the inherited entitlements. The release pipeline then
**verifies** it: `ci/check-nested-code.sh` asserts every Mach-O here — including
`llama-server` and any bundled `*.dylib` — is signed by our Team ID. An unsigned
or wrong-team sidecar fails the release.

Today the bundle relies on `disable-library-validation` (and friends) to load
this sidecar; signing it with our own Developer ID is what will let us drop those
weakened entitlements. See [`docs/RELEASE.md`](../../docs/RELEASE.md).
