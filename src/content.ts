// Content script: enforces DLP on AI sites BEFORE data leaves the page.
//
// Design (after real-world tuning):
//   • Don't fight the site's editor on paste. Let the paste land, then on the
//     next tick REPLACE THE WHOLE FIELD with the scanned-clean version. Full
//     replacement avoids the "redacted + original both present" duplication.
//   • The hard guarantee is SUBMIT BLOCKING: on Enter / send-click we re-scan
//     the actual current text and stop the send if anything sensitive remains.
//   • Enforce first, report last; never let a chrome.* failure abort protection.

import { getConfig, type ExtConfig } from "./config";
import { scan, type Action, type Policy } from "./dlp";
import { getCachedOrgPolicy, resolvePolicies, syncOrgPolicy } from "./policy";
import { matchSite, type SiteConfig } from "./sites";

const site = matchSite(location.host, location.pathname);
if (site) void init(site);

function alive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

async function init(site: SiteConfig) {
  let cfg: ExtConfig;
  try {
    cfg = await getConfig();
  } catch {
    return;
  }
  if (!cfg.enabled) return;

  // Org-managed policy (if any) drives the detectors AND the enforcement mode;
  // otherwise we fall back to the built-in default at the locally-set mode.
  let policies: Policy[];
  let mode: Action;
  ({ policies, mode } = resolvePolicies(await getCachedOrgPolicy(), cfg.mode));

  // Refresh the org policy in the background so this tab picks up dashboard
  // changes without a reload (fails open — keeps the cached/default policy).
  void syncOrgPolicy().then((org) => {
    if (org) ({ policies, mode } = resolvePolicies(org, cfg.mode));
  });

  try {
    chrome.storage.onChanged.addListener(async () => {
      try {
        cfg = await getConfig();
        ({ policies, mode } = resolvePolicies(await getCachedOrgPolicy(), cfg.mode));
        pushEgressConfig(cfg, mode); // keep the MAIN-world backstop in sync
      } catch {
        /* context gone — keep cached policy */
      }
    });
  } catch {
    /* ignore */
  }

  // ── Network egress backstop bridge ──────────────────────────────────────────
  // egress.ts runs in the MAIN world and can't read chrome.storage, so we push
  // config to it and relay its block/flag events into telemetry + a banner.
  pushEgressConfig(cfg, mode);
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window) return;
    const d = e.data as
      | { __safeguard?: string; kind?: string; labels?: string[]; count?: number }
      | null;
    if (!d || typeof d.__safeguard !== "string") return;
    if (d.__safeguard === "egress-ready") {
      pushEgressConfig(cfg, mode); // it loaded/reloaded — (re)send config
    } else if (d.__safeguard === "egress-event") {
      const labels = d.labels ?? [];
      const count = d.count ?? labels.length;
      if (d.kind === "block") {
        banner(
          `SafeGuard blocked a network request leaking ${count} sensitive item(s)`,
          "block",
        );
      } else {
        banner(`⚠️ SafeGuard: network request carried ${count} sensitive item(s)`, "warn");
      }
      reportSummary(site, "egress", mode, labels, count);
    }
  });

  const findInput = (): HTMLElement | null => {
    // Prefer the focused editable element, then site/generic selectors.
    const active = document.activeElement as HTMLElement | null;
    if (active && isEditable(active)) return active;
    for (const sel of site.inputSelectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return el;
    }
    return null;
  };

  // ── Paste: let it land, then replace the whole field with the clean version.
  document.addEventListener(
    "paste",
    (e) => {
      const el = editableFrom(e.target) ?? findInput();
      if (!el) return;
      // Defer so the editor finishes its own insertion first.
      setTimeout(() => sanitizeField(el, "paste"), 0);
    },
    true,
  );

  // ── Submit: the hard stop. Re-scan current text; block/redact if dirty.
  const onSubmitAttempt = (e: Event): void => {
    const el = findInput();
    if (!el) return;
    const res = scan(getText(el), policies);
    if (res.findings.length === 0) return; // clean → allow

    if (mode === "flag") {
      banner(`⚠️ SafeGuard: sending ${res.findings.length} sensitive item(s)`, "warn");
    } else {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (mode === "redact") {
        replaceAll(el, res.text);
        banner(`SafeGuard redacted ${res.findings.length} item(s) — review and send again`, "ok");
      } else {
        banner("SafeGuard blocked a message containing sensitive data — remove it to send", "block");
      }
    }
    report(site, "submit", mode, res.findings);
  };

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) onSubmitAttempt(e);
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target as Element;
      const isSend =
        site.submitSelectors.some((sel) => t.closest(sel)) || !!t.closest("button[type='submit']");
      if (isSend) onSubmitAttempt(e);
    },
    true,
  );

  /** Read the field, and if it contains sensitive data apply the configured mode. */
  function sanitizeField(el: HTMLElement, action: string) {
    const res = scan(getText(el), policies);
    if (res.findings.length === 0) return;
    if (mode === "flag") {
      banner(`⚠️ SafeGuard: ${res.findings.length} sensitive item(s) detected`, "warn");
    } else if (mode === "redact") {
      replaceAll(el, res.text);
      banner(`SafeGuard redacted ${res.findings.length} sensitive item(s)`, "ok");
    } else {
      replaceAll(el, ""); // block: clear the sensitive paste
      banner("SafeGuard blocked sensitive content from your prompt", "block");
    }
    report(site, action, mode, res.findings);
  }
}

function isEditable(el: Element): boolean {
  return (
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLInputElement ||
    (el as HTMLElement).isContentEditable
  );
}

function editableFrom(target: EventTarget | null): HTMLElement | null {
  let el = target as HTMLElement | null;
  while (el) {
    if (isEditable(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function getText(el: HTMLElement): string {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
    ? el.value
    : (el.innerText ?? "");
}

/**
 * Replace the ENTIRE field content with `text`. Handles React-controlled
 * textareas/inputs (via the native value setter) and contenteditable editors
 * (ProseMirror/Lexical/etc.) via select-all + insertText.
 */
function replaceAll(el: HTMLElement, text: string) {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  // contenteditable: select all, then replace via the editor's input pipeline.
  const sel = window.getSelection();
  if (sel) {
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  if (!document.execCommand("insertText", false, text)) {
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
}

/** Push current config to the MAIN-world egress backstop via postMessage. The
 *  enforcement `mode` is the effective one (org policy if present, else local). */
function pushEgressConfig(cfg: ExtConfig, mode: Action) {
  try {
    window.postMessage(
      {
        __safeguard: "config",
        cfg: {
          enabled: cfg.enabled,
          guard: cfg.egressGuard,
          mode,
          ignoreUrl: cfg.controlPlaneUrl,
        },
      },
      "*",
    );
  } catch {
    /* ignore */
  }
}

// Telemetry: metadata only, never throws, never the prompt text.
function report(site: SiteConfig, action: string, outcome: string, findings: { label: string }[]) {
  const labels = [...new Set(findings.map((f) => f.label))];
  reportSummary(site, action, outcome, labels, findings.length);
}

function reportSummary(
  site: SiteConfig,
  action: string,
  outcome: string,
  labels: string[],
  count: number,
) {
  if (!alive()) return;
  try {
    chrome.runtime.sendMessage({
      type: "shadow_event",
      event: {
        site: site.id,
        siteName: site.name,
        host: location.host,
        action,
        outcome,
        labels: [...new Set(labels)],
        count,
        at: new Date().toISOString(),
      },
    });
  } catch {
    /* context invalidated / messaging failed — enforcement already happened */
  }
}

function banner(message: string, kind: "ok" | "warn" | "block") {
  const colors = { ok: "#16a34a", warn: "#d97706", block: "#dc2626" } as const;
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = `
    position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);
    background:${colors[kind]};color:#fff;padding:10px 16px;border-radius:10px;
    font:500 13px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:90vw;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
