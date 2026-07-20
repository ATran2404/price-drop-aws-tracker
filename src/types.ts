export interface TrackedProduct {
  asin: string;
  country: string;
  url: string;
  title: string;
  image: string;
  currency: string;
  initialPrice: number;
  lastPrice: number;
  lowestPrice: number;
  targetPrice: number | null;
  addedAt: number;
  lastCheckedAt: number;
  lastError?: string | null;
}

export interface Settings {
  rapidApiKey: string;
  checkIntervalMinutes: number;
}

export interface ProductDetails {
  title: string;
  image: string;
  price: number;
  currency: string;
  raw: unknown;
}

/** Discriminated-union message types passed between content/popup/options and the background worker */
export type ExtensionMessage =
  | { type: "ADD_PRODUCT"; payload: { asin: string; url: string; country: string } }
  | { type: "REMOVE_PRODUCT"; payload: { asin: string; country: string } }
  | { type: "SET_TARGET_PRICE"; payload: { asin: string; country: string; targetPrice: number | null } }
  | { type: "CHECK_NOW"; payload: { asin: string; country: string } }
  | { type: "CHECK_ALL_NOW" }
  | { type: "SETTINGS_UPDATED" };

export interface MessageResponse {
  ok: boolean;
  error?: string;
  alreadyTracked?: boolean;
  product?: TrackedProduct;
}
