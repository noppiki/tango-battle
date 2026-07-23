const CACHE_VERSION = "v7";
const CACHE_NAME = `tango-battle-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  "./index.html",
  "./css/style.css",
  "./js/balance.js",
  "./js/storage.js",
  "./js/srs.js",
  "./js/audio.js",
  "./js/items.js",
  "./js/battle.js",
  "./js/ui.js",
  "./js/platform.js",
  "./js/entitlements.js",
  "./js/entitlements-mock.js",
  "./js/paywall-ui.js",
  "./js/main.js",
  "./data/words.json",
  "./data/words.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon.png",
  "./icons/apple-touch-icon.png",
  "./img/ui/avatar_child.png",
  "./img/ui/avatar_parent.png",
  "./img/ui/banner_win.png",
  "./img/ui/banner_lose.png",
  "./img/ui/book.png",
  "./img/ui/flame.png",
  "./img/ui/gift.png",
  "./img/ui/question.png",
  "./img/ui/spk_on.png",
  "./img/ui/spk_off.png",
  "./img/items/mush.png",
  "./img/items/green.png",
  "./img/items/red.png",
  "./img/items/banana.png",
  "./img/items/thunder.png",
  "./img/items/squid.png",
  "./img/items/star.png",
  "./img/items/empty.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          event.request.mode === "navigate"
            ? caches.match("./index.html")
            : cached
        );
    })
  );
});
