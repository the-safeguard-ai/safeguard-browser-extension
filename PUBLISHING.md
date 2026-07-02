# Publishing the SafeGuard AI browser extension

One codebase ships to **Chrome Web Store** (Chrome/Edge/Brave) and **Firefox
Add-ons (AMO)**. `bun run build` produces both artifacts:

| Store | Artifact | Manifest |
|---|---|---|
| Chrome Web Store | `dist/` → `safeguard-chrome.zip` | `service_worker`, MV3 |
| Firefox AMO | `dist-firefox/` → `safeguard-firefox.zip` | `background.scripts`, `browser_specific_settings.gecko`, `strict_min_version 128.0` |

Tagging `v*` builds and attaches both zips to the GitHub release (see
`.github/workflows/ci.yml`). Optional automated store upload: `publish.yml`.

---

## 0. One-time accounts

- **Chrome Web Store:** a Google account + [developer registration](https://chrome.google.com/webstore/devconsole) (one-time **$5** fee).
- **Firefox AMO:** a Mozilla account at [addons.mozilla.org](https://addons.mozilla.org/developers/) (free).
- A publicly hosted **privacy policy URL** (both stores require it — see `PRIVACY.md`; host it on the marketing site or link the raw file).

## 1. Listing copy (reuse for both stores)

- **Name:** SafeGuard AI — Shadow AI Protection
- **Summary (≤132 chars, Chrome):** Detect & redact sensitive data before it leaves your browser in ChatGPT, Claude, Gemini, Grok & more.
- **Category:** Productivity (Chrome) / Privacy & Security (Firefox)
- **Description:**
  > SafeGuard AI protects your data when you use AI tools. It scans prompts in the
  > browser and redacts PII and secrets (emails, cards, SSNs, IBANs, IP addresses,
  > API keys, phone numbers, and more) **before** they reach the AI provider — at
  > zero token cost, with no prompt data sent anywhere by default. Works on ChatGPT,
  > Claude, Gemini, Grok, Copilot, Perplexity, DeepSeek and 20+ other AI apps.
  > Individuals use it free; organizations can connect it to a SafeGuard tenant or a
  > self-hosted server for central policy, discovery, and audit.
  > Open source (AGPL-3.0): https://github.com/the-safeguard-ai

## 2. Store assets (need real captures)

- ✅ **Icon 128×128** — shipped in `icons/icon-128.png`.
- ⬜ **Screenshots** — 1280×800 or 640×400 (Chrome needs ≥1). Capture: the popup
  connection selector, a redaction banner on ChatGPT, the options page.
- ⬜ **Small promo tile** 440×280 (Chrome, optional but recommended).
- The brand avatar/mark for marketing lives in the repo `brand/` of the monorepo.

## 3. Permission justifications (reviewers ask for these)

- **`storage`** — persist the user's settings (deployment, enforcement mode) and a
  local count of items caught. Synced via `chrome.storage.sync`.
- **`host_permissions` (AI sites)** — inject the in-page DLP content script and the
  MAIN-world egress backstop **only** on the listed AI chat sites, to scan and
  redact prompts locally. No broad `<all_urls>` access.
- **No remote code** — everything is bundled; the extension executes no
  externally-fetched scripts (Chrome MV3 & AMO both require this).

## 4. Data & privacy disclosure

- Prompt text is **processed locally** and never leaves the browser except as the
  redacted prompt the user themselves submits to their chosen AI site.
- The only outbound calls SafeGuard itself makes are optional **telemetry**
  (metadata: site, detector labels, counts — never prompt text) and **policy sync**,
  and only when the user connects an organization/self-hosted control-plane.
- Chrome "Data safety" form: declare *website content* is handled, used only for the
  app's core function, **not sold**, **not used for ads**, processed locally. Link
  `PRIVACY.md`.

## 5. Chrome Web Store — submit

```bash
bun run build
(cd dist && zip -r ../safeguard-chrome.zip .)   # or download from the GitHub release
```
1. Developer Dashboard → **Add new item** → upload `safeguard-chrome.zip`.
2. Fill listing (copy above), upload icon + screenshots, set the privacy policy URL.
3. Complete the **Privacy practices** tab (§4). Justify each permission (§3).
4. Submit for review (typically hours–days).

## 6. Firefox AMO — submit

Firefox requires a **min version 128** (the MAIN-world egress backstop) and, because
the code is bundled/minified, a **source-code submission** with build steps.

```bash
bun run build
(cd dist-firefox && zip -r ../safeguard-firefox.zip .)
# source archive for AMO review:
git archive --format=zip -o safeguard-firefox-source.zip HEAD
```
1. AMO Developer Hub → **Submit a New Add-on** → **On this site** → upload `safeguard-firefox.zip`.
2. When prompted “Do you use build tools?”, upload `safeguard-firefox-source.zip` and
   provide build steps:
   > `bun install && bun run build`, then package `dist-firefox/`. Built with Bun
   > (see `build.ts`); no minifier config beyond Bun's default.
3. Fill listing (copy above) + privacy policy; submit for review.

Alternatively sign/self-distribute with `web-ext`:
```bash
bunx web-ext sign --source-dir dist-firefox \
  --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
```

## 7. Automated publish (optional)

`.github/workflows/publish.yml` uploads to both stores on a `v*` tag **when enabled**
(repo variable `PUBLISH_ENABLED = true`) and these repo secrets are set:

| Secret | Store | From |
|---|---|---|
| `CHROME_EXTENSION_ID` | Chrome | the item's ID in the dashboard |
| `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN` | Chrome | Google Cloud OAuth (Web Store API) |
| `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` | Firefox | AMO → Manage API Keys |

Until then, publish manually with the steps above.

## 8. Version bumps

Bump `manifest.json` `"version"` (and keep it in sync across a release), tag `vX.Y.Z`,
let CI attach the zips, then upload (or let `publish.yml` do it).
