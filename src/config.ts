// Extension configuration, persisted in chrome.storage.sync. IT can pre-seed
// these via managed storage (enterprise policy) so rollout needs no user input.

import type { Action } from "./dlp";

export interface ExtConfig {
  /** Control-plane base URL for telemetry, e.g. http://localhost:8081 */
  controlPlaneUrl: string;
  /** Org enrollment key (an sg_ API key) used to authenticate telemetry. */
  orgKey: string;
  /** Enforcement mode applied to detected sensitive data. */
  mode: Action; // redact | block | flag(=educate/warn)
  /** Master on/off switch. */
  enabled: boolean;
  /**
   * Network egress backstop: wrap the page's fetch/XHR and HARD-BLOCK any
   * outgoing request whose body still contains sensitive data (a fail-safe for
   * when the on-page DOM redaction missed it). Detect-and-block only — never
   * mutates request bodies. In "flag" mode it observes/reports without blocking.
   */
  egressGuard: boolean;
}

export const DEFAULT_CONFIG: ExtConfig = {
  controlPlaneUrl: "http://localhost:8081",
  orgKey: "",
  mode: "redact",
  enabled: true,
  egressGuard: true,
};

export async function getConfig(): Promise<ExtConfig> {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...stored } as ExtConfig;
}

export async function setConfig(patch: Partial<ExtConfig>): Promise<void> {
  await chrome.storage.sync.set(patch);
}
