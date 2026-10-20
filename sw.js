/* OpenPlate service worker — offline-first app shell.
   Strategy: network-first for same-origin files (so replacing files on the server
   updates the app on the next load), falling back to the cache when offline.
   The full recipe data pack (data-mealdb.js / data-dummyjson.js) precaches with the
   shell; the 800+ recipe photos are cached on first view for offline reuse. */
'use strict';
const CACHE = 'openplate-v4';
const SHELL = [
  './', './index.html', './css/styles.css',
  './js/app.js', './js/util.js', './js/data-local.js', './js/data-mealdb.js', './js/data-dummyjson.js', './js/sources.js',
  './js/store.js', './js/planner.js', './js/charts.js', './js/nutrition.js', './js/prices.js',
  './js/views-core.js', './js/views-recipes.js', './js/views-settings.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-64.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }).catch(() =>
      caches.match(e.request).then((hit) => hit || caches.match('./index.html'))
    )
  );
});
