# SafeGuard AI — Browser Extension

A Manifest V3 extension for **Chrome/Edge/Brave and Firefox** that protects sensitive
data in AI tools (ChatGPT, Claude, Gemini, Grok, and more) **before it leaves the
browser** — at zero token cost:

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
bun run build      # → dist/ (Chrome) and dist-firefox/ (Firefox)
```

- **Chrome / Edge / Brave:** `chrome://extensions` → enable Developer mode → **Load unpacked** → select `dist/`.
- **Firefox (128+):** `about:debugging` → **This Firefox** → **Load Temporary Add-on** → pick any file in `dist-firefox/`.

> One codebase builds both. Firefox uses `background.scripts` (no service worker) and
> requires **Firefox 128+** for the MAIN-world egress backstop; the extension API is
> accessed through a `browser ?? chrome` shim (`src/browser-api.ts`) for promise
> semantics on both engines.

## Release

Tagging `v*` builds and attaches both **`safeguard-chrome.zip`** and
**`safeguard-firefox.zip`** as GitHub release assets (see `.github/workflows/ci.yml`).

## License

AGPL-3.0-only — see [LICENSE](LICENSE).
