// Bundles the extension with Bun and assembles the loadable dist/ directory.
// Usage: bun run build.ts
import { cp, mkdir, rm } from "node:fs/promises";

const root = import.meta.dir;
const dist = `${root}/dist`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const result = await Bun.build({
  entrypoints: [
    `${root}/src/content.ts`,
    `${root}/src/egress.ts`,
    `${root}/src/background.ts`,
    `${root}/src/popup.ts`,
    `${root}/src/options.ts`,
  ],
  outdir: dist,
  target: "browser",
  minify: true,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Static assets → dist
await cp(`${root}/manifest.json`, `${dist}/manifest.json`);
await cp(`${root}/src/popup.html`, `${dist}/popup.html`);
await cp(`${root}/src/options.html`, `${dist}/options.html`);

console.log("✓ Extension built → dist/  (load unpacked in chrome://extensions)");
