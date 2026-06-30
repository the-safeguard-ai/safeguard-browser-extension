# SafeGuard AI — Browser Extension

A Manifest V3 browser extension that protects sensitive data in AI tools (ChatGPT,
Claude, Gemini, Grok, and more) **before it leaves the browser** — at zero token cost:

- **In-browser DLP** — scans prompts and redacts PII/secrets inline using the same
  detectors as the SafeGuard gateway (`src/dlp.ts` mirrors `crates/dlp`).
- **Network egress backstop** — a MAIN-world hook inspects outbound requests and stops
  sensitive payloads from being sent, even on sites the content script can't fully cover.
- **Policy-aware** — pulls org policies from the SafeGuard control-plane when signed in.

The SafeGuard gateway still scans authoritatively; this is defense-in-depth at the edge.

## Develop

```bash
bun install
bun run typecheck
bun test
bun run build      # outputs the unpacked extension to dist/
```

Load `dist/` via `chrome://extensions` → **Load unpacked**.

## Release

Tagging `v*` builds and attaches a packaged MV3 zip as a GitHub release asset
(see `.github/workflows/ci.yml`).

## License

AGPL-3.0-only — see [LICENSE](LICENSE).
