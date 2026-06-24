# Security Policy

WhatsGuard is a security and privacy tool, so we take vulnerabilities seriously
and appreciate responsible disclosure.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, report privately to **security@shakehand.co** (or **a@shakehand.co**).
If possible, include:

- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- affected version(s) and platform,
- any suggested remediation.

You can expect an acknowledgement within a few business days. We will work with
you on a fix and coordinate a disclosure timeline; we're happy to credit you
once the issue is resolved, unless you prefer to remain anonymous.

## Scope

Because WhatsGuard runs on-device and processes private messages, we're
especially interested in:

- anything that causes message content to leave the device,
- tampering with the detection model, prompt, or scam-rules configuration,
- code execution via the bundled `llama-server` sidecar or model files,
- bypasses of the SHA-256 verification used when downloading the model.

## Supported versions

This is the open-source free edition; security fixes are applied to the latest
release. Please make sure you're on the most recent version before reporting.
