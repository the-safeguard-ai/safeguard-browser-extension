// Browser-side DLP engine. Mirrors crates/dlp (rules.rs + intl.rs) so the same
// detections run client-side before data leaves the page — at zero token cost.
//
// NOTE: crates/dlp (Rust) is the source of truth. These patterns must stay in
// sync; a future build step will generate this file from exported rule JSON.

export type Action = "redact" | "block" | "flag";

export interface Detector {
  pattern: string; // key referenced by a policy (e.g. "email")
  label: string; // shown in [REDACTED:label] and telemetry
  regex: RegExp;
}

// `g` flag required for matchAll/replace-all semantics.
export const DETECTORS: Detector[] = [
  { pattern: "email", label: "EMAIL", regex: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi },
  {
    pattern: "api_key",
    label: "API_KEY",
    regex: /\b(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  },
  { pattern: "credit_card", label: "CREDIT_CARD", regex: /\b(?:\d[ -]*?){13,16}\b/g },
  { pattern: "ssn", label: "SSN", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  // Generic phone (local formats, no leading +). Mirrors crates/dlp rules.rs PHONE.
  { pattern: "phone", label: "PHONE", regex: /\+?\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g },
  { pattern: "iban", label: "IBAN", regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g },
  {
    pattern: "ip_address",
    label: "IP_ADDRESS",
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
  { pattern: "passport", label: "PASSPORT", regex: /\b[A-Z]{1,2}\d{6,9}\b/g },
  { pattern: "intl_phone", label: "INTL_PHONE", regex: /\+\d{6,15}\b/g },
];

// Synonyms collapse to existing detectors (matches the Rust mapping).
const ALIASES: Record<string, string> = { secret: "api_key", token: "api_key" };

export interface Finding {
  label: string;
  start: number;
  end: number;
}

export interface ScanResult {
  text: string; // redacted output (== input when nothing redacted)
  findings: Finding[];
  blocked: boolean;
}

export interface Policy {
  name: string;
  enabled: boolean;
  patterns: string[];
  action: Action;
}

// The more protective of two actions (block > redact > flag), used when
// overlapping findings from different policies are merged into one span.
function strongerAction(a: Action, b: Action): Action {
  if (a === "block" || b === "block") return "block";
  if (a === "redact" || b === "redact") return "redact";
  return "flag";
}

// Merge overlapping/duplicate findings into distinct spans. Without this the same
// bytes can be matched by more than one policy (e.g. two policies both enabling
// `email`); applying those duplicates would redact the same range twice with
// stale offsets, corrupting the token (`…EMAIL]IL]`) and inflating the count.
// Mirrors crates/dlp `dedupe_findings`.
function dedupeFindings(
  items: { f: Finding; action: Action }[],
): { f: Finding; action: Action }[] {
  if (items.length < 2) return items;
  const sorted = [...items].sort((a, b) => a.f.start - b.f.start || b.f.end - a.f.end);
  const merged: { f: Finding; action: Action }[] = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last && item.f.start < last.f.end) {
      last.f.end = Math.max(last.f.end, item.f.end);
      last.action = strongerAction(last.action, item.action);
      continue;
    }
    merged.push({ f: { ...item.f }, action: item.action });
  }
  return merged;
}

/** Scan text against the active policies using the built-in detectors. */
export function scan(input: string, policies: Policy[]): ScanResult {
  const raw: { f: Finding; action: Action }[] = [];
  let blocked = false;

  for (const policy of policies) {
    if (!policy.enabled) continue;
    for (const rawPat of policy.patterns) {
      const pat = ALIASES[rawPat] ?? rawPat;
      const det = DETECTORS.find((d) => d.pattern === pat);
      if (!det) continue;
      const re = new RegExp(det.regex.source, det.regex.flags);
      for (const m of input.matchAll(re)) {
        if (m.index === undefined) continue;
        raw.push({
          f: { label: det.label, start: m.index, end: m.index + m[0].length },
          action: policy.action,
        });
        if (policy.action === "block") blocked = true;
      }
    }
  }

  const findings = dedupeFindings(raw);

  // Apply redactions right-to-left so earlier offsets remain valid.
  const redactable = findings
    .filter((x) => x.action === "redact")
    .sort((a, b) => b.f.start - a.f.start);

  let text = input;
  for (const { f } of redactable) {
    text = text.slice(0, f.start) + `[REDACTED:${f.label}]` + text.slice(f.end);
  }

  return { text, findings: findings.map((x) => x.f), blocked };
}

/** Default policy used until org config is fetched. */
export function defaultPolicy(action: Action = "redact"): Policy {
  return {
    name: "Default PII Protection",
    enabled: true,
    patterns: [
      "email", "api_key", "credit_card", "ssn", "phone",
      "iban", "ip_address", "intl_phone",
    ],
    action,
  };
}
