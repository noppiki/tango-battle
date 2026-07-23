// Platform detection — thin layer for PWA vs Capacitor store (kids) builds.
// Store builds gate grade IAP; web/PWA keeps all grades unlocked.
// Safe when Capacitor is absent (phase ③).

export function isNative() {
  try {
    return !!(
      typeof window !== 'undefined' &&
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform() === true
    );
  } catch {
    return false;
  }
}

/** Kids-category store build: native Capacitor WebView for now. */
export function isKidsBuild() {
  return isNative();
}
