// Grade-unlock entitlements (store monetization).
// Web/PWA: provider reports all owned (via entitlements-mock.js, web build only).
// Native kids build: g5 free; others via IAP provider (RevenueCat in phase ③).

import { isKidsBuild } from './platform.js';

const GRADE_PRODUCT = {
  g4: 'unlock_g4',
  g3: 'unlock_g3',
  p2: 'unlock_p2',
};

export const PRODUCTS = {
  unlock_g4: { id: 'unlock_g4', label: '4級アンロック', priceYen: 800, grade: 'g4' },
  unlock_g3: { id: 'unlock_g3', label: '3級アンロック', priceYen: 800, grade: 'g3' },
  unlock_p2: { id: 'unlock_p2', label: '準2級アンロック', priceYen: 800, grade: 'p2' },
  unlock_all: { id: 'unlock_all', label: 'すべてのレベルをまとめて購入', priceYen: 1800, grade: null },
};

export const ALL_UNLOCK_PRODUCT_IDS = ['unlock_g4', 'unlock_g3', 'unlock_p2', 'unlock_all'];

/** @type {{ getOwnedProductIds(): string[], purchase(id: string): Promise<{ok:boolean, reason?:string}>, restore(): Promise<{ok:boolean, restored?:boolean}> }} */
let provider = createNativeFallbackProvider();

/** Test-only override for kids-build gating in node --test. */
let kidsBuildOverride = null;

export function _setKidsBuildForTests(value) {
  kidsBuildOverride = value;
}

function _isKidsGated() {
  if (kidsBuildOverride !== null) return kidsBuildOverride;
  return isKidsBuild();
}

function _ownsProduct(productId) {
  return provider.getOwnedProductIds().includes(productId);
}

export function isGradeUnlocked(grade) {
  if (!_isKidsGated()) return true;
  if (grade === 'g5') return true;
  if (_ownsProduct('unlock_all')) return true;
  const productId = GRADE_PRODUCT[grade];
  return productId ? _ownsProduct(productId) : false;
}

export function productForGrade(grade) {
  return GRADE_PRODUCT[grade] || null;
}

export function formatPriceYen(yen) {
  return `¥${yen.toLocaleString('ja-JP')}`;
}

export async function purchase(productId) {
  return provider.purchase(productId);
}

export async function restore() {
  return provider.restore();
}

export function setProvider(next) {
  provider = next || createNativeFallbackProvider();
}

/** Native fail-closed fallback until RevenueCat is wired (phase ③). */
export function createNativeFallbackProvider() {
  return {
    getOwnedProductIds() {
      return [];
    },
    async purchase() {
      return { ok: false, reason: 'unavailable' };
    },
    async restore() {
      return { ok: false, reason: 'unavailable' };
    },
  };
}

/** Pure helper: whether a grade tap/selection should proceed. */
export function canSelectGrade(grade) {
  return isGradeUnlocked(grade);
}
