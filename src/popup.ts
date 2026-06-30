import { getAuth, login, logout } from "./auth";
import { clearOrgPolicy, syncOrgPolicy } from "./policy";
import { getConfig } from "./config";

const $ = (id: string) => document.getElementById(id)!;
const show = (id: string, on: boolean) => $(id).classList.toggle("hide", !on);

async function render() {
  const auth = await getAuth();
  const cfg = await getConfig();
  const itMode = !auth && !!cfg.orgKey;

  show("login-view", !auth && !itMode);
  show("main-view", !!auth || itMode);

  if (auth || itMode) {
    $("org").textContent = auth ? `Organization: ${auth.orgName || "—"}` : "Linked via IT key";
    const { stats } = await chrome.storage.local.get({ stats: { total: 0, byLabel: {} } });
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
  $(id).addEventListener("click", () => chrome.runtime.openOptionsPage());
}

void render();
