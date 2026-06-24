# WhatsGuard

**On-device WhatsApp scam detection.** WhatsGuard is a desktop app that links to
your WhatsApp and quietly flags likely scam messages using a local AI model —
**everything stays on your computer.** No message content ever leaves the device.

> ⚠️ WhatsGuard is an independent project and is not affiliated with or endorsed
> by WhatsApp or Meta.

## How it works

1. You link WhatsApp by scanning a QR code (the same way WhatsApp Web works).
2. Incoming messages are screened by a local large language model — **Gemma**,
   running through [`llama.cpp`](https://github.com/ggml-org/llama.cpp) on your
   own machine.
3. When a message looks like a scam, WhatsGuard raises an alert explaining why
   (risk level, category, and a plain-language reason).

The AI model runs **entirely offline** after a one-time download. Your chats are
never uploaded, and detection happens locally.

## Features

- 🔒 **Private by design** — on-device inference; message content never leaves
  your computer.
- 🧠 **Local LLM** — Gemma via a bundled `llama-server` sidecar (Apple Silicon).
- 🌐 **Multilingual** — English, Chinese, and Indonesian.
- ✅ **Trusted contacts** — a safe list so people you trust are never flagged.
- ⚙️ **Settings** — system info and a graceful shutdown control.
- 🛟 **Guided setup** — a first-run wizard handles linking and the model download.

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/), TypeScript
- [Baileys](https://github.com/WhiskeySockets/Baileys) for the WhatsApp connection
- [llama.cpp](https://github.com/ggml-org/llama.cpp) for local inference (Gemma GGUF)
- Packaged with [electron-builder](https://www.electron.build/) (macOS, Apple Silicon)

## Development

```bash
npm install
npm run dev        # run the app in development
npm run build      # type-check + bundle
npm test           # run the unit tests (vitest)
npm run pack:mac   # build a macOS .dmg
```

> **Note:** the native `llama-server` binary is **not** committed (it's
> git-ignored). Place an Apple-Silicon build of llama.cpp's server at
> `resources/bin/llama-server` before packaging — see
> [`resources/bin/README.md`](resources/bin/README.md). The AI model itself is
> downloaded and SHA-256–verified on first run, not bundled in the installer.

## Privacy

WhatsGuard processes messages locally. The app does not transmit your message
content to any server. The only network activity is the one-time model download
(from a public model host) and the WhatsApp connection itself.

## Security

Found a vulnerability? Please see [SECURITY.md](SECURITY.md) for how to report
it responsibly.

## License

Licensed under the [Apache License 2.0](LICENSE). © 2026 ShakeHand.
