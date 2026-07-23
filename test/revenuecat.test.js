// RevenueCat provider: entitlement translation, offline cache, purchase mapping.
// Run: node --test test/

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RevenueCatProvider } from '../js/revenuecat.js';

const STORAGE_KEY = 'eiken-p2-rc-entitlements';

function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
  return store;
}

function installPurchasesStub(overrides = {}) {
  const calls = { configure: 0, getProducts: 0, purchaseStoreProduct: 0 };
  const Purchases = {
    async configure() {
      calls.configure += 1;
      if (overrides.configure) return overrides.configure();
    },
    async getCustomerInfo() {
      return { customerInfo: { entitlements: { active: {} } } };
    },
    async getProducts(opts) {
      calls.getProducts += 1;
      if (overrides.getProducts) return overrides.getProducts(opts);
      return { products: [{ identifier: opts.productIdentifiers[0] }] };
    },
    async purchaseStoreProduct(opts) {
      calls.purchaseStoreProduct += 1;
      if (overrides.purchaseStoreProduct) return overrides.purchaseStoreProduct(opts);
      return {
        customerInfo: {
          entitlements: {
            active: { grade_g4: { identifier: 'grade_g4', isActive: true } },
          },
        },
      };
    },
    async restorePurchases() {
      return { customerInfo: { entitlements: { active: {} } } };
    },
  };
  globalThis.window = {
    Capacitor: { Plugins: { Purchases } },
  };
  return { Purchases, calls };
}

describe('RevenueCatProvider', () => {
  beforeEach(() => {
    installLocalStorage();
    RevenueCatProvider._resetCache();
  });

  afterEach(() => {
    RevenueCatProvider._resetCache();
    delete globalThis.localStorage;
    delete globalThis.window;
  });

  it('translates entitlement ids to product ids', () => {
    assert.deepEqual(
      RevenueCatProvider._entitlementsToProductIds(['grade_g4']),
      ['unlock_g4'],
    );
    assert.deepEqual(
      RevenueCatProvider._entitlementsToProductIds(['grade_g4', 'grade_g3']),
      ['unlock_g4', 'unlock_g3'],
    );
  });

  it('synthesizes unlock_all when all grade entitlements are active', () => {
    const products = RevenueCatProvider._entitlementsToProductIds([
      'grade_g4',
      'grade_g3',
      'grade_p2',
    ]);
    assert.deepEqual(products, ['unlock_g4', 'unlock_g3', 'unlock_p2', 'unlock_all']);
  });

  it('loads offline cache without Purchases global', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['grade_g4', 'grade_g3']));
    RevenueCatProvider._reloadCacheFromStorage();
    assert.deepEqual(RevenueCatProvider.getOwnedProductIds(), ['unlock_g4', 'unlock_g3']);
  });

  it('maps successful purchase to ok:true and refreshes owned products', async () => {
    installPurchasesStub();
    const result = await RevenueCatProvider.purchase('unlock_g4');
    assert.equal(result.ok, true);
    assert.deepEqual(RevenueCatProvider.getOwnedProductIds(), ['unlock_g4']);
  });

  it('maps user-cancelled purchase to reason:cancelled', async () => {
    installPurchasesStub({
      purchaseStoreProduct: async () => {
        throw { userCancelled: true };
      },
    });
    const result = await RevenueCatProvider.purchase('unlock_g4');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'cancelled');
  });

  it('maps PURCHASE_CANCELLED_ERROR code to reason:cancelled', async () => {
    installPurchasesStub({
      purchaseStoreProduct: async () => {
        throw { readableErrorCode: 'PURCHASE_CANCELLED_ERROR' };
      },
    });
    const result = await RevenueCatProvider.purchase('unlock_g3');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'cancelled');
  });

  it('returns unavailable when Purchases plugin is absent', async () => {
    globalThis.window = {};
    const result = await RevenueCatProvider.purchase('unlock_g4');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unavailable');
  });
});
