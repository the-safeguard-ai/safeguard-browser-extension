import { api } from "./browser-api";
// Extension configuration, persisted in api.storage.sync. IT can pre-seed
// these via managed storage (enterprise policy) so rollout needs no user input.

import type { Action } from "./dlp";

/**
 * How this browser connects to SafeGuard's control-plane:
 *  • cloud        — individual user on our managed SaaS. Zero config.
 *  • organization — the user's org has a SaaS tenant; they enter its URL/slug.
 *  • self-hosted  — the org runs SafeGuard themselves; they enter the server URL.
 */
export type Deployment = "cloud" | "organization" | "self-hosted";

/** Managed SaaS endpoints. Individual users hit these directly, no setup. */
export const CLOUD_CONTROL_PLANE = "https://api.thesafeguard.ai";
/** Org tenants live at https://<slug>.thesafeguard.ai unless a full URL is given. */
export const CLOUD_ORG_BASE = "thesafeguard.ai";

/** What actually lives in api.storage.sync. */
export interface StoredConfig {
  deployment: Deployment;
  /** organization mode: assigned tenant URL or bare slug. */
  orgUrl: string;
  /** self-hosted mode: control-plane base URL (http://host:8081). */
  selfHostUrl: string;
  /** Org enrollment key (an sg_ API key) used to authenticate telemetry. */
  orgKey: string;
  /** Enforcement mode applied to detected sensitive data. */
  mode: Action; // redact | block | flag(=educate/warn)
  /** Master on/off switch. */
  enabled: boolean;
  /**
   * Network egress backstop: wrap the page's fetch/XHR and hard-block any
   * outgoing request whose body still carries sensitive data. Only acts in
   * block/flag policies (redact is enforced on-page); never mutates bodies.
   */
  egressGuard: boolean;
}

/** Resolved runtime config = stored fields + the derived control-plane URL. */
export interface ExtConfig extends StoredConfig {
  /** Effective control-plane base URL for the chosen deployment. */
  controlPlaneUrl: string;
}

export const DEFAULT_CONFIG: StoredConfig = {
  deployment: "cloud",
  orgUrl: "",
  selfHostUrl: "http://localhost:8081",
  orgKey: "",
  mode: "redact",
  enabled: true,
  egressGuard: true,
};

function trimUrl(u: string): string {
  return (u || "").trim().replace(/\/+$/, "");
}

/** Turn an org URL or bare slug into a full control-plane base URL. */
export function normalizeOrgUrl(input: string): string {
  const v = trimUrl(input);
  if (!v) return CLOUD_CONTROL_PLANE;
  if (/^https?:\/\//i.test(v)) return v; // full URL as given
  if (v.includes(".")) return `https://${v}`; // bare host
  return `https://${v}.${CLOUD_ORG_BASE}`; // slug → tenant subdomain
}

/** The effective control-plane base URL for a given (stored) config. */
export function resolveControlPlaneUrl(c: StoredConfig): string {
  switch (c.deployment) {
    case "organization":
      return normalizeOrgUrl(c.orgUrl);
    case "self-hosted":
      return trimUrl(c.selfHostUrl) || DEFAULT_CONFIG.selfHostUrl;
    case "cloud":
    default:
      return CLOUD_CONTROL_PLANE;
  }
}

export async function getConfig(): Promise<ExtConfig> {
  const stored = (await api.storage.sync.get(DEFAULT_CONFIG)) as StoredConfig;
  const merged = { ...DEFAULT_CONFIG, ...stored };
  return { ...merged, controlPlaneUrl: resolveControlPlaneUrl(merged) };
}

export async function setConfig(patch: Partial<StoredConfig>): Promise<void> {
  await api.storage.sync.set(patch);
}
