import browser from "webextension-polyfill";
import type { ExtensionMessage, MessageResponse, Settings, TrackedProduct } from "./types";

const productListEl = document.getElementById("productList") as HTMLDivElement;
const emptyStateEl = document.getElementById("emptyState") as HTMLDivElement;
const noKeyWarningEl = document.getElementById("noKeyWarning") as HTMLDivElement;
const checkAllBtn = document.getElementById("checkAllBtn") as HTMLButtonElement;
const settingsBtn = document.getElementById("settingsBtn") as HTMLButtonElement;
const openOptionsLink = document.getElementById("openOptionsLink") as HTMLAnchorElement;

async function sendMessage(message: ExtensionMessage): Promise<MessageResponse> {
  try {
    return (await browser.runtime.sendMessage(message)) as MessageResponse;
  } catch {
    return { ok: false, error: "Could not reach background script" };
  }
}

function openOptions(): void {
  browser.runtime.openOptionsPage();
}

function timeAgo(ts: number): string {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderProduct(p: TrackedProduct): HTMLDivElement {
  const item = document.createElement("div");
  item.className = "product-item";

  const priceDirClass = p.lastPrice < p.initialPrice ? "down" : p.lastPrice > p.initialPrice ? "up" : "";

  item.innerHTML = `
    <img src="${p.image || ""}" alt="" onerror="this.style.visibility='hidden'" />
    <div class="product-info">
      <div class="product-title">${escapeHtml(p.title || "Product")}</div>
      <div class="price-row">
        <span class="current-price ${priceDirClass}">${p.currency || ""}${p.lastPrice}</span>
        ${
          p.initialPrice !== p.lastPrice
            ? `<span class="original-price">${p.currency || ""}${p.initialPrice}</span>`
            : ""
        }
      </div>
      <div class="meta-row">
        Lowest: ${p.currency || ""}${p.lowestPrice} · Checked ${timeAgo(p.lastCheckedAt)}
        ${p.lastError ? `<br/><span style="color:#c0392b">${escapeHtml(p.lastError)}</span>` : ""}
      </div>
    </div>
    <div class="item-actions">
      <button class="open-btn">Open</button>
      <button class="check-btn">Check</button>
      <button class="remove-btn">Remove</button>
    </div>
  `;

  item.querySelector(".open-btn")!.addEventListener("click", () => {
    browser.tabs.create({ url: p.url });
  });

  item.querySelector(".check-btn")!.addEventListener("click", async (e) => {
    const target = e.target as HTMLButtonElement;
    target.textContent = "...";
    target.disabled = true;
    await sendMessage({ type: "CHECK_NOW", payload: { asin: p.asin, country: p.country } });
    await loadProducts();
  });

  item.querySelector(".remove-btn")!.addEventListener("click", async () => {
    await sendMessage({ type: "REMOVE_PRODUCT", payload: { asin: p.asin, country: p.country } });
    await loadProducts();
  });

  return item;
}

async function loadProducts(): Promise<void> {
  const { trackedProducts, settings } = await browser.storage.local.get(["trackedProducts", "settings"]);
  const products = (trackedProducts as TrackedProduct[]) || [];
  const s = settings as Settings | undefined;

  noKeyWarningEl.classList.toggle("hidden", !!(s && s.rapidApiKey));

  productListEl.innerHTML = "";
  if (products.length === 0) {
    emptyStateEl.classList.remove("hidden");
    return;
  }
  emptyStateEl.classList.add("hidden");

  products
    .slice()
    .sort((a, b) => b.addedAt - a.addedAt)
    .forEach((p) => productListEl.appendChild(renderProduct(p)));
}

checkAllBtn.addEventListener("click", async () => {
  checkAllBtn.textContent = "Checking...";
  checkAllBtn.disabled = true;
  await sendMessage({ type: "CHECK_ALL_NOW" });
  await loadProducts();
  checkAllBtn.textContent = "Check all now";
  checkAllBtn.disabled = false;
});

settingsBtn.addEventListener("click", openOptions);
openOptionsLink.addEventListener("click", (e) => {
  e.preventDefault();
  openOptions();
});

loadProducts();
