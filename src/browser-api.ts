// Cross-browser WebExtension API handle.
//
// Chrome (MV3) exposes a promise-based `chrome.*`. Firefox exposes a
// promise-based `browser.*` (its `chrome.*` alias is callback-based). Preferring
// `browser` when present gives us promise semantics on both engines, so the rest
// of the extension can `await` storage/runtime calls uniformly.
export const api: typeof chrome =
  (globalThis as unknown as { browser?: typeof chrome }).browser ?? chrome;
