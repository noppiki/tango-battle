// RevenueCat entitlement provider (native Capacitor only).
// Accessed via window.Capacitor.Plugins.Purchases — not importable in no-bundler runtime.

import { REVENUECAT_API_KEY, PRODUCT_IDS } from './store-config.js';
import { isNative } from './platform.js';

const STORAGE_KEY = 'eiken-p2-rc-entitlements';

const ENTITLEMENT_TO_PRODUCT = {
  grade_g4: 'unlock_g4',
  grade_g3: 'unlock_g3',
  grade_p2: 'unlock_p2',
};

const ALL_GRADE_ENTITLEMENTS = ['grade_g4', 'grade_g3', 'grade_p2'];

function _getPurchases() {
  try {
    if (typeof window === 'undefined') return null;
    return window.Capacitor?.Plugins?.Purchases || null;
  } catch {
    return null;
  }
}

function _readCacheFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => typeof id === 'string' && ENTITLEMENT_TO_PRODUCT[id]));
  } catch {
    return new Set();
  }
}

function _writeCacheToStorage(entitlementIds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...entitlementIds]));
  } catch {
    /* storage unavailable */
  }
}

/** Active RevenueCat entitlement ids (grade_g4, grade_g3, grade_p2). */
let activeEntitlements = _readCacheFromStorage();

function _entitlementsToProductIds(entitlementIds) {
  const set = entitlementIds instanceof Set ? entitlementIds : new Set(entitlementIds);
  const products = [];
  ALL_GRADE_ENTITLEMENTS.forEach((entId) => {
    if (set.has(entId)) products.push(ENTITLEMENT_TO_PRODUCT[entId]);
  });
  if (ALL_GRADE_ENTITLEMENTS.every((entId) => set.has(entId))) {
    products.push('unlock_all');
  }
  return products;
}

function _refreshFromCustomerInfo(customerInfo) {
  if (!customerInfo || !customerInfo.entitlements || !customerInfo.entitlements.active) return;
  const next = new Set();
  Object.keys(customerInfo.entitlements.active).forEach((id) => {
    if (ENTITLEMENT_TO_PRODUCT[id]) next.add(id);
  });
  activeEntitlements = next;
  _writeCacheToStorage(activeEntitlements);
}

function _isUserCancelled(err) {
  if (!err) return false;
  if (err.userCancelled === true) return true;
  if (err.code === '1' || err.code === 1) return true;
  const readable = (err.userInfo && err.userInfo.readableErrorCode) || err.readableErrorCode;
  return readable === 'PURCHASE_CANCELLED_ERROR';
}

function getOwnedProductIds() {
  return _entitlementsToProductIds(activeEntitlements);
}

async function init() {
  if (!isNative()) return;
  const Purchases = _getPurchases();
  if (!Purchases) return;

  try {
    await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
  } catch {
    return;
  }

  try {
    const result = await Purchases.getCustomerInfo();
    _refreshFromCustomerInfo(result.customerInfo);
  } catch {
    /* keep last-known cache */
  }
}

async function purchase(productId) {
  const Purchases = _getPurchases();
  if (!Purchases) return { ok: false, reason: 'unavailable' };
  if (!PRODUCT_IDS.includes(productId)) {
    return { ok: false, reason: 'invalid_product' };
  }

  try {
    const productResult = await Purchases.getProducts({
      productIdentifiers: [productId],
      type: 'NON_SUBSCRIPTION',
    });
    const product = productResult.products && productResult.products[0];
    if (!product) return { ok: false, reason: 'product_not_found' };

    const purchaseResult = await Purchases.purchaseStoreProduct({ product });
    _refreshFromCustomerInfo(purchaseResult.customerInfo);
    return { ok: true };
  } catch (err) {
    if (_isUserCancelled(err)) return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: 'error' };
  }
}

async function restore() {
  const Purchases = _getPurchases();
  if (!Purchases) return { ok: false, restored: false };

  try {
    const result = await Purchases.restorePurchases();
    _refreshFromCustomerInfo(result.customerInfo);
    return { ok: true, restored: activeEntitlements.size > 0 };
  } catch {
    return { ok: false, restored: false };
  }
}

/** Test hook: clear entitlement cache. */
function _resetCache() {
  activeEntitlements = new Set();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/** Test hook: reload entitlement cache from localStorage. */
function _reloadCacheFromStorage() {
  activeEntitlements = _readCacheFromStorage();
}

export const RevenueCatProvider = {
  init,
  getOwnedProductIds,
  purchase,
  restore,
  _resetCache,
  _reloadCacheFromStorage,
  _entitlementsToProductIds,
};
