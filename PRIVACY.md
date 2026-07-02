# SafeGuard AI Browser Extension — Privacy Policy

_Last updated: 2026-07-02_

SafeGuard AI is a privacy tool. Its purpose is to **keep your sensitive data from
leaving your browser** when you use AI websites. This policy explains exactly what
the extension does and does not do with your data.

## What the extension processes

- **Prompt text you type or paste on AI sites** is scanned **locally, in your
  browser**, to detect and redact sensitive data (PII and secrets such as emails,
  payment-card numbers, national IDs, IBANs, IP addresses, API keys, and phone
  numbers). This scanning happens on your device. Prompt text is **never sent to
  SafeGuard** and is never sold or shared.
- The only place your prompt goes is the AI site **you** are already using — and
  only after sensitive data has been redacted (or blocked, per your settings).

## What the extension stores

- **Settings** (deployment choice, enforcement mode, server/org URL) and a **local
  count** of items caught, kept in the browser's extension storage. Settings may sync
  across your own browsers via the browser's built-in sync.

## What the extension sends (only if you connect an organization/self-hosted server)

If — and only if — you sign in or configure an organization or self-hosted SafeGuard
control-plane, the extension may send:

- **Policy sync:** a request to fetch your organization's DLP policy.
- **Telemetry (metadata only):** the AI site, the *types* of detectors that matched,
  and counts — used for your organization's Shadow-AI dashboard. **This never
  includes your prompt text or the sensitive values themselves.**

Individual users on SafeGuard Cloud with no organization connection send no such data.

## What the extension never does

- It does **not** transmit your prompts or the detected sensitive values to SafeGuard
  or any third party.
- It does **not** sell or share your data, and does **not** use it for advertising.
- It does **not** execute remotely-hosted code; all logic is bundled in the extension.
- It requests site access **only** for the AI websites it supports, to do its job on
  those pages.

## Data retention & deletion

Local settings/counters live in your browser until you clear them or remove the
extension. Organization telemetry (metadata) retention is governed by your
organization's own SafeGuard deployment and its policies.

## Contact

Questions or requests: open an issue at
https://github.com/the-safeguard-ai/safeguard-browser-extension or contact your
SafeGuard administrator.
