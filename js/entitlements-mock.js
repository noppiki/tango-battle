// Web-only entitlement providers. EXCLUDED from the native www bundle via dynamic
// import() in main.js (phase ③ native build strips this module).

import { ALL_UNLOCK_PRODUCT_IDS, PRODUCTS } from './entitlements.js';

const MOCK_STORAGE_KEY = 'eiken-p2-entitlements-mock';
let memOwned = null;

function readOwned() {
  if (memOwned !== null) return [...memOwned];
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    memOwned = Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    return [...memOwned];
  } catch {
    memOwned = [];
    return [];
  }
}

function writeOwned(ids) {
  memOwned = [...new Set(ids)];
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(memOwned));
  } catch {
    /* storage unavailable */
  }
}

/** Web/PWA build: every grade is playable; no paywall surface. */
export const WebUnlockedProvider = {
  getOwnedProductIds() {
    return [...ALL_UNLOCK_PRODUCT_IDS];
  },
  async purchase(productId) {
    if (!PRODUCTS[productId]) return { ok: false, reason: 'invalid_product' };
    return { ok: true };
  },
  async restore() {
    return { ok: true, restored: true };
  },
};

/** Optional dev helper — localStorage-backed purchases (not used in production web). */
export function createMockPurchaseProvider() {
  return {
    getOwnedProductIds() {
      return readOwned();
    },
    async purchase(productId) {
      if (!PRODUCTS[productId]) return { ok: false, reason: 'invalid_product' };
      const owned = readOwned();
      if (!owned.includes(productId)) owned.push(productId);
      if (productId === 'unlock_all') {
        ALL_UNLOCK_PRODUCT_IDS.forEach((id) => {
          if (!owned.includes(id)) owned.push(id);
        });
      }
      writeOwned(owned);
      return { ok: true };
    },
    async restore() {
      const owned = readOwned();
      return { ok: true, restored: owned.length > 0 };
    },
  };
}
