import browser from "webextension-polyfill";
import type { Settings } from "./types";
import { getSettings, saveSettings } from "./storage";

const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
const intervalSelect = document.getElementById("interval") as HTMLSelectElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
const savedMsg = document.getElementById("savedMsg") as HTMLDivElement;
const toggleBtn = document.getElementById("toggleKeyVisibility") as HTMLButtonElement;

async function load(): Promise<void> {
  const settings = await getSettings();
  apiKeyInput.value = settings.rapidApiKey || "";
  intervalSelect.value = String(settings.checkIntervalMinutes || 180);
}

toggleBtn.addEventListener("click", () => {
  const isPassword = apiKeyInput.type === "password";
  apiKeyInput.type = isPassword ? "text" : "password";
  toggleBtn.textContent = isPassword ? "Hide" : "Show";
});

saveBtn.addEventListener("click", async () => {
  const settings: Settings = {
    rapidApiKey: apiKeyInput.value.trim(),
    checkIntervalMinutes: parseInt(intervalSelect.value, 10),
  };
  await saveSettings(settings);
  await browser.runtime.sendMessage({ type: "SETTINGS_UPDATED" });

  savedMsg.classList.remove("hidden");
  setTimeout(() => savedMsg.classList.add("hidden"), 2000);
});

load();
