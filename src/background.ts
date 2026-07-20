import browser from "webextension-polyfill";
import type { ExtensionMessage, MessageResponse, ProductDetails, TrackedProduct } from "./types";
import { getSettings, getProducts, saveProducts } from "./storage";

const RAPIDAPI_HOST = "real-time-amazon-data.p.rapidapi.com";
const DEFAULT_INTERVAL_MINUTES = 180;
const ALARM_NAME = "priceCheckAlarm";

function parsePrice(raw: unknown): { amount: number; currency: string } | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return { amount: raw, currency: "" };
  const str = String(raw).trim();
  const match = str.match(/([^\d.,\s]+)?\s*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const amount = parseFloat(match[2].replace(/,/g, ""));
  if (Number.isNaN(amount)) return null;
  return { amount, currency: match[1] || "" };
}

/**
 * Calls the "Real-Time Amazon Data" API on RapidAPI.
 * If the provider renames fields, adjust the `data.*` lookups below —
 * check RapidAPI's "Test Endpoint" panel for the current live shape.
 */
async function fetchProductDetails(asin: string, country: string, apiKey: string): Promise<ProductDetails> {
  const url = `https://${RAPIDAPI_HOST}/product-details?asin=${encodeURIComponent(asin)}&country=${encodeURIComponent(
    country || "US"
  )}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": RAPIDAPI_HOST,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`RapidAPI request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const json = await response.json();
  const data = json.data || json.result || json;

  const title: string = data.product_title || data.title || "Unknown product";
  const image: string = data.product_photo || data.product_image || data.image || "";
  const priceRaw = data.product_price ?? data.price ?? data.current_price;
  const parsed = parsePrice(priceRaw);

  if (!parsed) {
    console.warn("[PriceTracker] Could not parse price from API response:", json);
    throw new Error("Could not parse a price from the API response. See console for raw data.");
  }

  return {
    title,
    image,
    price: parsed.amount,
    currency: parsed.currency || data.currency || "",
    raw: data,
  };
}

async function addProduct(payload: { asin: string; url: string; country: string }): Promise<{
  alreadyTracked: boolean;
  product: TrackedProduct;
}> {
  const settings = await getSettings();
  if (!settings.rapidApiKey) {
    throw new Error("Add your RapidAPI key in the extension options first.");
  }

  const products = await getProducts();
  const existing = products.find((p) => p.asin === payload.asin && p.country === payload.country);
  if (existing) {
    return { alreadyTracked: true, product: existing };
  }

  const details = await fetchProductDetails(payload.asin, payload.country, settings.rapidApiKey);

  const product: TrackedProduct = {
    asin: payload.asin,
    url: payload.url,
    country: payload.country || "US",
    title: details.title,
    image: details.image,
    currency: details.currency,
    initialPrice: details.price,
    lastPrice: details.price,
    lowestPrice: details.price,
    targetPrice: null,
    addedAt: Date.now(),
    lastCheckedAt: Date.now(),
  };

  products.push(product);
  await saveProducts(products);
  return { alreadyTracked: false, product };
}

async function removeProduct(asin: string, country: string): Promise<void> {
  const products = await getProducts();
  await saveProducts(products.filter((p) => !(p.asin === asin && p.country === country)));
}

async function setTargetPrice(asin: string, country: string, targetPrice: number | null): Promise<void> {
  const products = await getProducts();
  const product = products.find((p) => p.asin === asin && p.country === country);
  if (product) {
    product.targetPrice = targetPrice;
    await saveProducts(products);
  }
}

async function checkOneProduct(product: TrackedProduct, apiKey: string): Promise<TrackedProduct> {
  try {
    const details = await fetchProductDetails(product.asin, product.country, apiKey);
    const priceDropped = details.price < product.lastPrice;
    const targetReached =
      product.targetPrice !== null && product.targetPrice !== undefined && details.price <= product.targetPrice;

    if (priceDropped) {
      await browser.notifications.create(`price-drop-${product.asin}-${Date.now()}`, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Price Drop! 📉",
        message: `${details.title}\n${product.currency}${product.lastPrice} → ${details.currency}${details.price}`,
        priority: 2,
      });
    }

    if (targetReached) {
      await browser.notifications.create(`target-reached-${product.asin}-${Date.now()}`, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Target Price Reached! 🎯",
        message: `${details.title} is now ${details.currency}${details.price}`,
        priority: 2,
      });
    }

    product.lastPrice = details.price;
    product.title = details.title || product.title;
    product.image = details.image || product.image;
    if (details.price < product.lowestPrice) product.lowestPrice = details.price;
    product.lastCheckedAt = Date.now();
    product.lastError = null;
  } catch (err) {
    console.error(`[PriceTracker] Failed to check ${product.asin}:`, err);
    product.lastError = String((err as Error).message || err);
    product.lastCheckedAt = Date.now();
  }
  return product;
}

async function checkAllProducts(): Promise<void> {
  const settings = await getSettings();
  if (!settings.rapidApiKey) return;

  const products = await getProducts();
  if (products.length === 0) return;

  const updated: TrackedProduct[] = [];
  for (const product of products) {
    // Sequential on purpose — stay comfortably within RapidAPI rate limits.
    const result = await checkOneProduct(product, settings.rapidApiKey);
    updated.push(result);
  }
  await saveProducts(updated);
}

async function scheduleAlarm(): Promise<void> {
  const settings = await getSettings();
  const minutes = settings.checkIntervalMinutes || DEFAULT_INTERVAL_MINUTES;
  await browser.alarms.create(ALARM_NAME, { periodInMinutes: minutes, delayInMinutes: 1 });
}

browser.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkAllProducts();
  }
});

browser.runtime.onMessage.addListener((raw: unknown): Promise<MessageResponse> => {
  const message = raw as ExtensionMessage;
  return (async (): Promise<MessageResponse> => {
    try {
      switch (message.type) {
        case "ADD_PRODUCT": {
          const result = await addProduct(message.payload);
          return { ok: true, ...result };
        }
        case "REMOVE_PRODUCT": {
          await removeProduct(message.payload.asin, message.payload.country);
          return { ok: true };
        }
        case "SET_TARGET_PRICE": {
          await setTargetPrice(message.payload.asin, message.payload.country, message.payload.targetPrice);
          return { ok: true };
        }
        case "CHECK_NOW": {
          const settings = await getSettings();
          if (!settings.rapidApiKey) throw new Error("No RapidAPI key set.");
          const products = await getProducts();
          const target = products.find(
            (p) => p.asin === message.payload.asin && p.country === message.payload.country
          );
          if (!target) throw new Error("Product not found.");
          const updated = await checkOneProduct(target, settings.rapidApiKey);
          const rest = products.filter((p) => !(p.asin === updated.asin && p.country === updated.country));
          await saveProducts([...rest, updated]);
          return { ok: true, product: updated };
        }
        case "CHECK_ALL_NOW": {
          await checkAllProducts();
          return { ok: true };
        }
        case "SETTINGS_UPDATED": {
          await scheduleAlarm();
          return { ok: true };
        }
        default: {
          // Exhaustiveness check: TypeScript errors here if a message type is unhandled above.
          const _exhaustive: never = message;
          return { ok: false, error: `Unknown message type: ${String((_exhaustive as { type?: string })?.type)}` };
        }
      }
    } catch (err) {
      return { ok: false, error: String((err as Error).message || err) };
    }
  })();
});
