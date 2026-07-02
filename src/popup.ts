import { api } from "./browser-api";
import { getAuth, login, logout } from "./auth";
import { clearOrgPolicy, syncOrgPolicy } from "./policy";
import { getConfig, setConfig, type Deployment } from "./config";

const $ = (id: string) => document.getElementById(id)!;
const show = (id: string, on: boolean) => $(id).classList.toggle("hide", !on);

/** Show only the input relevant to the selected deployment. */
function reflectDeployment(dep: Deployment) {
  show("cloudRow", dep === "cloud");
  show("orgRow", dep === "organization");
  show("selfRow", dep === "self-hosted");
}

async function render() {
  const auth = await getAuth();
  const cfg = await getConfig();

  // Connection section
  ($("deployment") as HTMLSelectElement).value = cfg.deployment;
  ($("orgUrl") as HTMLInputElement).value = cfg.orgUrl;
  ($("selfHostUrl") as HTMLInputElement).value = cfg.selfHostUrl;
  reflectDeployment(cfg.deployment);
  $("endpoint").textContent =
    cfg.deployment === "cloud" ? "Protected via SafeGuard Cloud" : `Connected to ${cfg.controlPlaneUrl}`;

  const itMode = !auth && !!cfg.orgKey;
  show("login-view", !auth && !itMode);
  show("main-view", !!auth || itMode);

  if (auth || itMode) {
    $("org").textContent = auth ? `Organization: ${auth.orgName || "—"}` : "Linked via IT key";
    const { stats } = await api.storage.local.get({ stats: { total: 0, byLabel: {} } });
    $("total").textContent = String(stats.total);
    const breakdown = $("breakdown");
    breakdown.innerHTML = "";
    for (const [label, n] of Object.entries(stats.byLabel as Record<string, number>)) {
      const row = document.createElement("div");
      row.className = "stat";
      row.innerHTML = `<span class="muted">${label}</span><span>${n}</span>`;
      breakdown.appendChild(row);
    }
    $("status").textContent = `Mode: ${cfg.mode}`;
    show("signout", !!auth);
  }
}

$("deployment").addEventListener("change", () => {
  reflectDeployment(($("deployment") as HTMLSelectElement).value as Deployment);
});

$("saveConn").addEventListener("click", async () => {
  const deployment = ($("deployment") as HTMLSelectElement).value as Deployment;
  await setConfig({
    deployment,
    orgUrl: ($("orgUrl") as HTMLInputElement).value.trim(),
    selfHostUrl: ($("selfHostUrl") as HTMLInputElement).value.trim(),
  });
  show("connSaved", true);
  setTimeout(() => show("connSaved", false), 1800);
  void syncOrgPolicy(); // re-pull policy from the new endpoint
  await render();
});

$("signin").addEventListener("click", async () => {
  const email = ($("email") as HTMLInputElement).value.trim();
  const password = ($("password") as HTMLInputElement).value;
  show("error", false);
  try {
    await login(email, password);
    void syncOrgPolicy(); // pull the org's configured policy for this user
    await render();
  } catch (e) {
    $("error").textContent = e instanceof Error ? e.message : "Sign in failed";
    show("error", true);
  }
});

$("signout").addEventListener("click", async () => {
  await logout();
  await clearOrgPolicy(); // drop org policy → revert to built-in default
  await render();
});

for (const id of ["options-link", "options-link2"]) {
  $(id).addEventListener("click", () => api.runtime.openOptionsPage());
}

void render();
