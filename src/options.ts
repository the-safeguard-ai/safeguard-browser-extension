import { getConfig, setConfig, resolveControlPlaneUrl, type Deployment, type StoredConfig } from "./config";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on: boolean) => $(id).classList.toggle("hide", !on);

function reflect(dep: Deployment) {
  show("orgRow", dep === "organization");
  show("selfRow", dep === "self-hosted");
  const preview: StoredConfig = {
    deployment: dep,
    orgUrl: $<HTMLInputElement>("orgUrl").value.trim(),
    selfHostUrl: $<HTMLInputElement>("selfHostUrl").value.trim(),
    orgKey: "",
    mode: "redact",
    enabled: true,
    egressGuard: true,
  };
  $("endpoint").textContent =
    dep === "cloud" ? "Endpoint: SafeGuard Cloud (managed)" : `Endpoint: ${resolveControlPlaneUrl(preview)}`;
}

async function load() {
  const cfg = await getConfig();
  $<HTMLSelectElement>("deployment").value = cfg.deployment;
  $<HTMLInputElement>("orgUrl").value = cfg.orgUrl;
  $<HTMLInputElement>("selfHostUrl").value = cfg.selfHostUrl;
  $<HTMLSelectElement>("mode").value = cfg.mode;
  $<HTMLInputElement>("orgKey").value = cfg.orgKey;
  $<HTMLInputElement>("enabled").checked = cfg.enabled;
  $<HTMLInputElement>("egressGuard").checked = cfg.egressGuard;
  reflect(cfg.deployment);
}

for (const id of ["deployment", "orgUrl", "selfHostUrl"]) {
  $(id).addEventListener("input", () =>
    reflect($<HTMLSelectElement>("deployment").value as Deployment),
  );
}

$<HTMLButtonElement>("save").addEventListener("click", async () => {
  const patch: Partial<StoredConfig> = {
    deployment: $<HTMLSelectElement>("deployment").value as Deployment,
    orgUrl: $<HTMLInputElement>("orgUrl").value.trim(),
    selfHostUrl: $<HTMLInputElement>("selfHostUrl").value.trim(),
    mode: $<HTMLSelectElement>("mode").value as StoredConfig["mode"],
    orgKey: $<HTMLInputElement>("orgKey").value.trim(),
    enabled: $<HTMLInputElement>("enabled").checked,
    egressGuard: $<HTMLInputElement>("egressGuard").checked,
  };
  await setConfig(patch);
  show("saved", true);
  setTimeout(() => show("saved", false), 2000);
});

void load();
