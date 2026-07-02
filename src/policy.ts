import { api } from "./browser-api";
// Org DLP policy sync. The extension ships with a sensible default policy, but
// once a user signs in (or IT seeds an org key) it pulls the org's configured
// detectors + enforcement mode from the control-plane so in-browser enforcement
// matches what the gateway would do. Fails open: any error keeps the last cached
// (or default) policy — protection is never weakened by a fetch failure.

import { getAuth, refresh } from "./auth";
import { getConfig } from "./config";
import { defaultPolicy, type Action, type Policy } from "./dlp";

export interface OrgPolicy {
  patterns: string[];
  mode: Action;
  enabled: boolean;
  fetchedAt: string;
}

const KEY = "orgPolicy";

export async function getCachedOrgPolicy(): Promise<OrgPolicy | null> {
  try {
    const { [KEY]: p } = await api.storage.local.get(KEY);
    return (p as OrgPolicy) ?? null;
  } catch {
    return null;
  }
}

export async function clearOrgPolicy(): Promise<void> {
  try {
    await api.storage.local.remove(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Fetch the org's effective DLP policy and cache it. Auth: user JWT (with one
 * transparent refresh on 401) preferred, else the IT-seeded org key. Returns
 * the policy on success, or null when unauthenticated/unreachable.
 */
export async function syncOrgPolicy(): Promise<OrgPolicy | null> {
  const cfg = await getConfig();
  if (!cfg.controlPlaneUrl) return null;
  const url = `${cfg.controlPlaneUrl}/api/extension/policy`;

  const tryFetch = async (headers: Record<string, string>): Promise<Response | null> => {
    try {
      return await fetch(url, { headers });
    } catch {
      return null;
    }
  };

  let res: Response | null = null;
  const auth = await getAuth();
  if (auth) {
    res = await tryFetch({ authorization: `Bearer ${auth.accessToken}` });
    if (res && res.status === 401) {
      const fresh = await refresh();
      if (fresh) res = await tryFetch({ authorization: `Bearer ${fresh}` });
    }
  } else if (cfg.orgKey) {
    res = await tryFetch({ "x-safeguard-key": cfg.orgKey });
  }

  if (!res || !res.ok) return null;
  let data: { patterns?: string[]; mode?: Action; enabled?: boolean };
  try {
    data = await res.json();
  } catch {
    return null;
  }

  const policy: OrgPolicy = {
    patterns: data.patterns ?? [],
    mode: data.mode ?? "redact",
    enabled: data.enabled ?? false,
    fetchedAt: new Date().toISOString(),
  };
  try {
    await api.storage.local.set({ [KEY]: policy });
  } catch {
    /* ignore */
  }
  return policy;
}

/**
 * Resolve the active client-side policies and enforcement mode. When the org
 * has pushed an enabled policy we use its detectors + mode; otherwise we fall
 * back to the extension's built-in default at the locally-configured mode.
 */
export function resolvePolicies(
  org: OrgPolicy | null,
  fallbackMode: Action,
): { policies: Policy[]; mode: Action } {
  if (org && org.enabled && org.patterns.length > 0) {
    return {
      policies: [{ name: "Org DLP Policy", enabled: true, patterns: org.patterns, action: org.mode }],
      mode: org.mode,
    };
  }
  return { policies: [defaultPolicy(fallbackMode)], mode: fallbackMode };
}
