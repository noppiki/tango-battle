// RevenueCat / IAP store configuration for 単語バトル.
//
// This key is a RevenueCat *Test Store* PUBLIC API key (dev/QA only,
// safe to commit — it cannot be used to access dashboard/account data).
// Before any App Store / Play submission, swap it for the production
// platform key (appl_... for iOS, goog_... for Android) — see
// claudedocs/plan-store-monetization.md Workstream 8.
export const REVENUECAT_API_KEY = 'test_siLoogXRQXJgJfWXDKLnRfwEPSE';

// Non-consumable unlock products — one per grade plus a bundle, matching
// the entitlement ids (grade_g4/grade_g3/grade_p2) used in js/entitlements.js.
export const PRODUCT_IDS = ['unlock_g4', 'unlock_g3', 'unlock_p2', 'unlock_all'];
