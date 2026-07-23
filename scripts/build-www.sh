#!/usr/bin/env bash
# Builds the www/ directory consumed by Capacitor (webDir).
#
# This is a pure copy step — the app is a no-build vanilla-JS PWA, so
# "build" here just means: assemble the runtime files that index.html
# actually references (manifest/icons/img/css/js/data) into www/,
# excluding tests, docs, node_modules, and other repo-only files.
#
# --native flag: produces the store (Capacitor) variant, which must be
# fail-closed per claudedocs/plan-store-monetization.md Workstream 3/4:
#   (a) js/entitlements-mock.js (web-only all-unlocked MockProvider) is
#       excluded from www/ entirely.
#   (b) Service-worker registration is neutralized. js/main.js's native
#       branch (isNative() === true) never imports entitlements-mock.js,
#       so (a) alone is safe for app logic — but sw.js's own APP_SHELL
#       cache list *references* "./js/entitlements-mock.js" by string, and
#       js/pwa-register.js unconditionally calls
#       navigator.serviceWorker.register(). Both sw.js and
#       js/pwa-register.js are therefore excluded from the native www/
#       copy, and the <script src="js/pwa-register.js"> tag is stripped
#       from www/index.html so no dead reference remains and no SW is
#       ever installed inside the native WebView.
#   (c) A grep assertion confirms www/ contains no "entitlements-mock"
#       string and no "MockPurchaseProvider" identifier anywhere —
#       exits non-zero if found.
#
# Without --native, this produces the full web/PWA copy (mock included,
# service worker registered as-is) — used for the GitHub Pages deploy,
# which is unaffected by this script (it serves the repo root directly).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WWW_DIR="$ROOT_DIR/www"

NATIVE=false
for arg in "$@"; do
  case "$arg" in
    --native) NATIVE=true ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

rm -rf "$WWW_DIR"
mkdir -p "$WWW_DIR"

RSYNC_EXCLUDES=(
  --exclude ".DS_Store"
  --exclude "*.md"
)

if [ "$NATIVE" = true ]; then
  RSYNC_EXCLUDES+=(
    --exclude "entitlements-mock.js"
    --exclude "pwa-register.js"
  )
fi

rsync -a "${RSYNC_EXCLUDES[@]}" index.html "$WWW_DIR/"
rsync -a "${RSYNC_EXCLUDES[@]}" manifest.json "$WWW_DIR/"
if [ "$NATIVE" = false ]; then
  rsync -a "${RSYNC_EXCLUDES[@]}" sw.js "$WWW_DIR/"
fi
rsync -a "${RSYNC_EXCLUDES[@]}" css/ "$WWW_DIR/css/"
rsync -a "${RSYNC_EXCLUDES[@]}" js/ "$WWW_DIR/js/"
rsync -a "${RSYNC_EXCLUDES[@]}" data/ "$WWW_DIR/data/"
rsync -a "${RSYNC_EXCLUDES[@]}" icons/ "$WWW_DIR/icons/"
rsync -a "${RSYNC_EXCLUDES[@]}" img/ "$WWW_DIR/img/"

if [ "$NATIVE" = true ]; then
  # Strip the service-worker registration script tag; sw.js and
  # pwa-register.js are already excluded above so no dead reference
  # remains in the native www/ copy.
  sed -i '' '/<script src="js\/pwa-register\.js"><\/script>/d' "$WWW_DIR/index.html"

  # js/main.js is shared between the web and native runtimes and branches
  # on isNative() at *runtime* (js/platform.js), so the mock provider's
  # dynamic-import line is dead code on native — it is never reached
  # because isNative() === true takes the RevenueCat/native-fallback
  # branch above it. It is still literal source text, though, so a naive
  # string audit of the shipped bundle (app-review / security scanning)
  # would flag it. Strip that dead line (and the one comment mentioning
  # the mock module) from the *native www copy only* — source js/main.js
  # and js/entitlements.js are untouched; behavior is identical since the
  # branch was unreachable on native regardless.
  sed -i '' \
    -e "/const { WebUnlockedProvider } = await import('\\.\\/entitlements-mock\\.js');/d" \
    -e '/entitlements\.setProvider(WebUnlockedProvider);/d' \
    "$WWW_DIR/js/main.js"
  sed -i '' '/Web\/PWA: provider reports all owned (via entitlements-mock.js, web build only)\./d' "$WWW_DIR/js/entitlements.js"

  echo "Running fail-closed native bundle assertion..."
  if grep -r -l -i "entitlements-mock" "$WWW_DIR" || grep -r -l "MockPurchaseProvider" "$WWW_DIR"; then
    echo "FAIL-CLOSED ASSERTION FAILED: native www/ bundle references mock entitlement code." >&2
    exit 1
  fi
  echo "OK: native www/ bundle contains no entitlements-mock / MockPurchaseProvider references."
fi

echo "www/ built at $WWW_DIR (native=$NATIVE)"
