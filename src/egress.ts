// MAIN-world network egress backstop.
//
// This runs in the PAGE's own JS context (manifest `world: "MAIN"`), so it can
// wrap the real `window.fetch` and `XMLHttpRequest` the site itself uses. It is
// the last line of defence: if a site's editor evades the on-page DOM redaction
// (content.ts) and sensitive data still reaches the network layer, this catches
// it at the wire.
//
// Guarantees / design constraints:
//   • DETECT-AND-BLOCK ONLY. It NEVER mutates request bodies (silently editing
//     what a user sends is dangerous and confusing). It either lets the request
//     through untouched, or aborts it entirely.
//   • Runs at document_start so it wraps fetch/XHR before the site captures its
//     own reference to them.
//   • MAIN world has NO access to chrome.* — config arrives from, and telemetry
//     is sent to, the isolated content script via window.postMessage.
//   • Fails OPEN on its own errors: a bug here must never break the page.

import { defaultPolicy, scan, type Action } from "./dlp";

interface EgressConfig {
  enabled: boolean; // master extension switch
  guard: boolean; // egress backstop on/off
  mode: Action; // redact | block | flag
  ignoreUrl: string; // control-plane URL — never inspect our own telemetry
}

// Safe defaults until the isolated content script pushes real config: protect
// by default (guard on, block on detect) so there is no unguarded window.
let cfg: EgressConfig = { enabled: true, guard: true, mode: "redact", ignoreUrl: "" };

// ── Bridge to the isolated content script ────────────────────────────────────
window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window) return;
  const d = e.data as { __safeguard?: string; cfg?: Partial<EgressConfig> } | null;
  if (d && d.__safeguard === "config" && d.cfg) {
    cfg = { ...cfg, ...d.cfg };
  }
});

// Announce readiness so the content script can (re)send config even if it loaded
// after us. Harmless if no one is listening yet.
function announce() {
  try {
    window.postMessage({ __safeguard: "egress-ready" }, "*");
  } catch {
    /* ignore */
  }
}
announce();

function report(kind: "block" | "flag", url: string, labels: string[], count: number) {
  try {
    window.postMessage(
      { __safeguard: "egress-event", kind, url, labels, count, at: new Date().toISOString() },
      "*",
    );
  } catch {
    /* never throw from the network path */
  }
}

function guarding(): boolean {
  return cfg.enabled && cfg.guard;
}

/** flag mode observes only; redact/block hard-stop at the wire. */
function shouldBlock(): boolean {
  return cfg.mode !== "flag";
}

function isIgnored(url: string): boolean {
  if (!cfg.ignoreUrl) return false;
  try {
    return url.startsWith(cfg.ignoreUrl);
  } catch {
    return false;
  }
}

/** Returns offending findings for a textual body, or null if clean / not text. */
function inspect(body: string): { labels: string[]; count: number } | null {
  if (!body || body.length > 2_000_000) return null; // skip empty / very large
  const res = scan(body, [defaultPolicy(cfg.mode)]);
  if (res.findings.length === 0) return null;
  const labels = [...new Set(res.findings.map((f) => f.label))];
  return { labels, count: res.findings.length };
}

/** Synchronously extract inspectable text from a body, or null if not text. */
function bodyToText(body: unknown): string | null {
  if (typeof body === "string") return body;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return body.toString();
  }
  return null; // FormData / Blob / ArrayBuffer / ReadableStream — not inspected
}

// ── fetch wrapper ─────────────────────────────────────────────────────────────
const realFetch = window.fetch;
window.fetch = function (
  this: typeof window,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const passthrough = () =>
    realFetch.apply(this, [input, init] as Parameters<typeof realFetch>);
  try {
    if (!guarding()) return passthrough();

    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (isIgnored(url)) return passthrough();

    // Body may be in init, or carried on a Request object. The init/string case
    // is synchronous (the common path for chat APIs). Request-object bodies need
    // an async clone+read, so handle that branch as a promise.
    const directText = bodyToText(init?.body);
    if (directText != null) {
      const hit = inspect(directText);
      if (hit) {
        report(shouldBlock() ? "block" : "flag", url, hit.labels, hit.count);
        if (shouldBlock()) return blocked();
      }
      return passthrough();
    }
    if (init?.body != null) return passthrough(); // non-text body — skip

    if (typeof Request !== "undefined" && input instanceof Request && input.body) {
      return input
        .clone()
        .text()
        .then((text) => {
          const hit = inspect(text);
          if (hit) {
            report(shouldBlock() ? "block" : "flag", url, hit.labels, hit.count);
            if (shouldBlock()) throw blockError();
          }
          return passthrough();
        })
        .catch((err) => {
          if (isBlockError(err)) return Promise.reject(err);
          return passthrough(); // read failed — fail open
        });
    }
  } catch {
    /* fail open */
  }
  return passthrough();
} as typeof window.fetch;

function blockError(): DOMException {
  return new DOMException("Blocked by SafeGuard AI: sensitive data detected", "AbortError");
}
function isBlockError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError" && /SafeGuard/.test(e.message);
}
function blocked(): Promise<Response> {
  return Promise.reject(blockError());
}

// ── XMLHttpRequest wrapper ────────────────────────────────────────────────────
type SgXHR = XMLHttpRequest & { __sgUrl?: string };
const xhrProto = XMLHttpRequest.prototype;
const realOpen = xhrProto.open;
const realSend = xhrProto.send;

xhrProto.open = function (this: SgXHR, method: string, url: string | URL, ...rest: unknown[]) {
  this.__sgUrl = typeof url === "string" ? url : url.href;
  // eslint-disable-next-line prefer-spread
  return (realOpen as (...a: unknown[]) => void).apply(this, [method, url, ...rest]);
} as typeof xhrProto.open;

xhrProto.send = function (this: SgXHR, body?: Document | XMLHttpRequestBodyInit | null) {
  try {
    if (guarding()) {
      const url = this.__sgUrl ?? "";
      if (!isIgnored(url)) {
        const text = bodyToText(body);
        if (text != null) {
          const hit = inspect(text);
          if (hit) {
            report(shouldBlock() ? "block" : "flag", url, hit.labels, hit.count);
            if (shouldBlock()) {
              this.abort();
              return;
            }
          }
        }
      }
    }
  } catch {
    /* fail open */
  }
  return (realSend as (b?: Document | XMLHttpRequestBodyInit | null) => void).apply(this, [body]);
} as typeof xhrProto.send;
