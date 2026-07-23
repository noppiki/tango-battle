// Entitlement translation + provider injection tests.
// Run: node --test test/

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTS,
  ALL_UNLOCK_PRODUCT_IDS,
  isGradeUnlocked,
  productForGrade,
  canSelectGrade,
  setProvider,
  createNativeFallbackProvider,
  _setKidsBuildForTests,
} from '../js/entitlements.js';
import { WebUnlockedProvider, createMockPurchaseProvider } from '../js/entitlements-mock.js';

describe('entitlements', () => {
  beforeEach(() => {
    _setKidsBuildForTests(null);
    setProvider(createNativeFallbackProvider());
  });

  afterEach(() => {
    _setKidsBuildForTests(null);
    setProvider(createNativeFallbackProvider());
  });

  it('web build (non-kids) unlocks every grade', () => {
    _setKidsBuildForTests(false);
    setProvider(createNativeFallbackProvider());
    assert.equal(isGradeUnlocked('g5'), true);
    assert.equal(isGradeUnlocked('g4'), true);
    assert.equal(isGradeUnlocked('p2'), true);
  });

  it('kids build: g5 is free, others locked without purchase', () => {
    _setKidsBuildForTests(true);
    assert.equal(isGradeUnlocked('g5'), true);
    assert.equal(isGradeUnlocked('g4'), false);
    assert.equal(isGradeUnlocked('g3'), false);
    assert.equal(isGradeUnlocked('p2'), false);
  });

  it('maps grades to product ids', () => {
    assert.equal(productForGrade('g4'), 'unlock_g4');
    assert.equal(productForGrade('g3'), 'unlock_g3');
    assert.equal(productForGrade('p2'), 'unlock_p2');
    assert.equal(productForGrade('g5'), null);
  });

  it('product labels avoid 英検', () => {
    assert.match(PRODUCTS.unlock_g4.label, /4級/);
    assert.doesNotMatch(PRODUCTS.unlock_g4.label, /英検/);
    assert.doesNotMatch(PRODUCTS.unlock_all.label, /英検/);
  });

  it('unlock_all grants every paid grade on kids build', () => {
    _setKidsBuildForTests(true);
    const provider = {
      getOwnedProductIds() {
        return ['unlock_all'];
      },
      async purchase() {
        return { ok: true };
      },
      async restore() {
        return { ok: true, restored: true };
      },
    };
    setProvider(provider);
    assert.equal(isGradeUnlocked('g4'), true);
    assert.equal(isGradeUnlocked('g3'), true);
    assert.equal(isGradeUnlocked('p2'), true);
  });

  it('individual product unlocks only its grade', () => {
    _setKidsBuildForTests(true);
    setProvider({
      getOwnedProductIds() {
        return ['unlock_g3'];
      },
      async purchase() {
        return { ok: true };
      },
      async restore() {
        return { ok: true, restored: true };
      },
    });
    assert.equal(isGradeUnlocked('g4'), false);
    assert.equal(isGradeUnlocked('g3'), true);
    assert.equal(isGradeUnlocked('p2'), false);
  });

  it('WebUnlockedProvider reports all product ids', () => {
    setProvider(WebUnlockedProvider);
    const owned = WebUnlockedProvider.getOwnedProductIds();
    assert.deepEqual(owned.sort(), [...ALL_UNLOCK_PRODUCT_IDS].sort());
    _setKidsBuildForTests(true);
    assert.equal(isGradeUnlocked('p2'), true);
  });

  it('MockPurchaseProvider unlock_all expands owned set', async () => {
    const mock = createMockPurchaseProvider();
    setProvider(mock);
    const result = await mock.purchase('unlock_all');
    assert.equal(result.ok, true);
    const owned = mock.getOwnedProductIds();
    assert.ok(owned.includes('unlock_g4'));
    assert.ok(owned.includes('unlock_g3'));
    assert.ok(owned.includes('unlock_p2'));
    assert.ok(owned.includes('unlock_all'));
  });

  it('canSelectGrade refuses locked grades on kids build', () => {
    _setKidsBuildForTests(true);
    assert.equal(canSelectGrade('g5'), true);
    assert.equal(canSelectGrade('g4'), false);
    assert.equal(canSelectGrade('p2'), false);
  });

  it('native fallback provider returns unavailable', async () => {
    const native = createNativeFallbackProvider();
    const purchase = await native.purchase('unlock_g4');
    assert.equal(purchase.ok, false);
    assert.equal(purchase.reason, 'unavailable');
  });
});
