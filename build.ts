// Bundles the extension with Bun and assembles loadable dist directories for
// BOTH Chrome (dist/) and Firefox (dist-firefox/) from one source tree.
// Usage: bun run build.ts
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const root = import.meta.dir;
const distChrome = `${root}/dist`;
const distFirefox = `${root}/dist-firefox`;

async function bundle(outdir: string) {
  const result = await Bun.build({
    entrypoints: [
      `${root}/src/content.ts`,
      `${root}/src/egress.ts`,
      `${root}/src/background.ts`,
      `${root}/src/popup.ts`,
      `${root}/src/options.ts`,
    ],
    outdir,
    target: "browser",
    minify: true,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

async function copyStatic(dir: string) {
  await cp(`${root}/src/popup.html`, `${dir}/popup.html`);
  await cp(`${root}/src/options.html`, `${dir}/options.html`);
  await cp(`${root}/icons`, `${dir}/icons`, { recursive: true });
}

// Firefox MV3 differences: no service_worker (use background.scripts), and it
// needs a gecko id. The MAIN-world egress content script requires Firefox 128+.
function toFirefoxManifest(chrome: Record<string, unknown>): Record<string, unknown> {
  const m = structuredClone(chrome);
  m.background = { scripts: ["background.js"] };
  m.browser_specific_settings = {
    gecko: { id: "safeguard@thesafeguard.ai", strict_min_version: "128.0" },
  };
  return m;
}

// ── Chrome ──────────────────────────────────────────────────────────────────
await rm(distChrome, { recursive: true, force: true });
await mkdir(distChrome, { recursive: true });
await bundle(distChrome);
await cp(`${root}/manifest.json`, `${distChrome}/manifest.json`);
await copyStatic(distChrome);

// ── Firefox ─────────────────────────────────────────────────────────────────
await rm(distFirefox, { recursive: true, force: true });
await mkdir(distFirefox, { recursive: true });
await bundle(distFirefox);
const chromeManifest = JSON.parse(await readFile(`${root}/manifest.json`, "utf8"));
await writeFile(
  `${distFirefox}/manifest.json`,
  JSON.stringify(toFirefoxManifest(chromeManifest), null, 2),
);
await copyStatic(distFirefox);

console.log("✓ Built → dist/ (Chrome, load unpacked) and dist-firefox/ (Firefox, load temporary add-on)");
