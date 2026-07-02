import { api } from "./browser-api";
// Service worker: forwards Shadow AI events to the control-plane. Auth is
// preferred via the signed-in user's JWT (auto-linked to their org); falls back
// to an IT-provisioned org key. Keeps a local rolling count for the popup.

import { getAuth, refresh } from "./auth";
import { getConfig } from "./config";
import { syncOrgPolicy } from "./policy";

// Pull the org's configured DLP policy on install and browser startup so the
// in-browser engine matches the dashboard from the first page load (best-effort).
api.runtime.onInstalled.addListener(() => void syncOrgPolicy());
api.runtime.onStartup.addListener(() => void syncOrgPolicy());

interface ShadowEvent {
  site: string;
  siteName: string;
  host: string;
  action: string;
  outcome: string;
  labels: string[];
  count: number;
  at: string;
}

api.runtime.onMessage.addListener((msg: { type: string; event?: ShadowEvent }) => {
  if (msg.type === "shadow_event" && msg.event) void handleEvent(msg.event);
  return false;
});

async function handleEvent(event: ShadowEvent) {
  await bumpLocalStats(event);

  const cfg = await getConfig();
  if (!cfg.controlPlaneUrl) return; // local-only

  const url = `${cfg.controlPlaneUrl}/api/telemetry/events`;
  const body = JSON.stringify(event);

  const auth = await getAuth();
  if (auth) {
    // JWT path with one transparent refresh on 401.
    let ok = await post(url, body, { authorization: `Bearer ${auth.accessToken}` });
    if (ok === 401) {
      const fresh = await refresh();
      if (fresh) await post(url, body, { authorization: `Bearer ${fresh}` });
    }
    return;
  }
  if (cfg.orgKey) {
    await post(url, body, { "x-safeguard-key": cfg.orgKey });
  }
}

/** Returns HTTP status, or 0 on network failure. */
async function post(url: string, body: string, authHeader: Record<string, string>): Promise<number> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader },
      body,
    });
    return res.status;
  } catch {
    return 0; // offline: best-effort, drop
  }
}

async function bumpLocalStats(event: ShadowEvent) {
  const { stats } = await api.storage.local.get({ stats: { total: 0, byLabel: {} } });
  stats.total += event.count;
  for (const label of event.labels) {
    stats.byLabel[label] = (stats.byLabel[label] ?? 0) + 1;
  }
  await api.storage.local.set({ stats });
}
