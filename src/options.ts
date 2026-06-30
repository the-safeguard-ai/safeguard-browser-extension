import { getConfig, setConfig, type ExtConfig } from "./config";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function load() {
  const cfg = await getConfig();
  $<HTMLSelectElement>("mode").value = cfg.mode;
  $<HTMLInputElement>("controlPlaneUrl").value = cfg.controlPlaneUrl;
  $<HTMLInputElement>("orgKey").value = cfg.orgKey;
  $<HTMLInputElement>("enabled").checked = cfg.enabled;
  $<HTMLInputElement>("egressGuard").checked = cfg.egressGuard;
}

$<HTMLButtonElement>("save").addEventListener("click", async () => {
  const patch: Partial<ExtConfig> = {
    mode: $<HTMLSelectElement>("mode").value as ExtConfig["mode"],
    controlPlaneUrl: $<HTMLInputElement>("controlPlaneUrl").value.trim(),
    orgKey: $<HTMLInputElement>("orgKey").value.trim(),
    enabled: $<HTMLInputElement>("enabled").checked,
    egressGuard: $<HTMLInputElement>("egressGuard").checked,
  };
  await setConfig(patch);
  const saved = $("saved");
  saved.style.display = "inline";
  setTimeout(() => (saved.style.display = "none"), 2000);
});

void load();
