import browser from "webextension-polyfill";
import type { ExtensionMessage, MessageResponse, TrackedProduct } from "./types";

function extractAsin(url: string): string | null {
  const match = url.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i);
  return match ? match[1].toUpperCase() : null;
}

function extractCountry(hostname: string): string {
  const map: Record<string, string> = {
    "amazon.com": "US",
    "amazon.co.uk": "GB",
    "amazon.ca": "CA",
    "amazon.de": "DE",
    "amazon.in": "IN",
  };
  const host = hostname.replace(/^www\./, "");
  return map[host] || "US";
}

const asin = extractAsin(location.href);

if (asin) {
  const country = extractCountry(location.hostname);

  async function sendMessage(message: ExtensionMessage): Promise<MessageResponse> {
    try {
      return (await browser.runtime.sendMessage(message)) as MessageResponse;
    } catch {
      return { ok: false, error: "Could not reach background script" };
    }
  }

  function buildButton(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.id = "price-tracker-btn";
    btn.textContent = "🔔 Track Price";
    document.body.appendChild(btn);
    return btn;
  }

  async function refreshButtonState(btn: HTMLButtonElement): Promise<void> {
    const { trackedProducts } = await browser.storage.local.get("trackedProducts");
    const products = (trackedProducts as TrackedProduct[]) || [];
    const tracked = products.find((p) => p.asin === asin && p.country === country);
    if (tracked) {
      btn.textContent = "✓ Tracking (click to remove)";
      btn.classList.add("tracked");
    } else {
      btn.textContent = "🔔 Track Price";
      btn.classList.remove("tracked");
    }
  }

  function showToast(text: string, isError = false): void {
    const toast = document.createElement("div");
    toast.className = "price-tracker-toast" + (isError ? " error" : "");
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("visible"), 10);
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  const btn = buildButton();
  refreshButtonState(btn);

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const isTracked = btn.classList.contains("tracked");

    if (isTracked) {
      btn.textContent = "Removing...";
      await sendMessage({ type: "REMOVE_PRODUCT", payload: { asin, country } });
      showToast("Stopped tracking this product.");
      await refreshButtonState(btn);
      btn.disabled = false;
      return;
    }

    btn.textContent = "Adding...";
    const response = await sendMessage({
      type: "ADD_PRODUCT",
      payload: { asin, url: location.href, country },
    });

    if (response.ok) {
      if (response.alreadyTracked) {
        showToast("Already tracking this product.");
      } else if (response.product) {
        const p = response.product;
        showToast(`Now tracking! Current price: ${p.currency}${p.lastPrice}`);
      }
    } else {
      showToast(response.error || "Could not add product. Check your RapidAPI key in options.", true);
    }

    await refreshButtonState(btn);
    btn.disabled = false;
  });
}
