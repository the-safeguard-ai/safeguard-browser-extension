import { api } from "./browser-api";
// Extension account auth. Non-technical users simply sign in with their
// SafeGuard email + password; the extension stores tokens and auto-links to
// their org. (IT can alternatively pre-seed an org key in config for zero-touch
// rollout — see config.ts.)

import { getConfig } from "./config";

export interface AuthState {
  accessToken: string;
  refreshToken: string;
  orgName: string;
  email: string;
  role: string;
}

const AUTH_KEY = "auth";

export async function getAuth(): Promise<AuthState | null> {
  const { auth } = await api.storage.local.get(AUTH_KEY);
  return (auth as AuthState) ?? null;
}

async function setAuth(auth: AuthState | null) {
  if (auth) await api.storage.local.set({ [AUTH_KEY]: auth });
  else await api.storage.local.remove(AUTH_KEY);
}

export async function login(email: string, password: string): Promise<AuthState> {
  const { controlPlaneUrl } = await getConfig();
  const res = await fetch(`${controlPlaneUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "Invalid email or password" : `Login failed (${res.status})`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    user: { email: string; role: string };
  };
  const auth: AuthState = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    orgName: "", // filled below
    email: data.user.email,
    role: data.user.role,
  };
  // org name for display
  try {
    const s = await fetch(`${controlPlaneUrl}/api/org/settings`, {
      headers: { authorization: `Bearer ${auth.accessToken}` },
    });
    if (s.ok) auth.orgName = ((await s.json()) as { orgName: string }).orgName;
  } catch {
    /* non-fatal */
  }
  await setAuth(auth);
  return auth;
}

export async function logout() {
  await setAuth(null);
}

/** Refresh the access token; returns the new token or null if refresh failed. */
export async function refresh(): Promise<string | null> {
  const auth = await getAuth();
  if (!auth) return null;
  const { controlPlaneUrl } = await getConfig();
  try {
    const res = await fetch(`${controlPlaneUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    if (!res.ok) {
      await setAuth(null); // refresh token expired → force re-login
      return null;
    }
    const { access_token } = (await res.json()) as { access_token: string };
    await setAuth({ ...auth, accessToken: access_token });
    return access_token;
  } catch {
    return null;
  }
}
