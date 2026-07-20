import browser from "webextension-polyfill";
import type { Settings, TrackedProduct } from "./types";

const DEFAULT_SETTINGS: Settings = {
  rapidApiKey: "",
  checkIntervalMinutes: 180,
};

export async function getSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get("settings");
  return (settings as Settings) || DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}

export async function getProducts(): Promise<TrackedProduct[]> {
  const { trackedProducts } = await browser.storage.local.get("trackedProducts");
  return (trackedProducts as TrackedProduct[]) || [];
}

export async function saveProducts(products: TrackedProduct[]): Promise<void> {
  await browser.storage.local.set({ trackedProducts: products });
}
