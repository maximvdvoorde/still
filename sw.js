// Keeps the game on the device, so it works without a connection. Everything is
// served from the saved copy straight away and refreshed in the background, so
// she never waits for the network and an update simply appears on a later open.

const CACHE = 'still-1';

const FILES = [
  './',
  'style.css',
  'src/ui.js',
  'src/engine.js',
  'src/storage.js',
  'levels/levels.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map((file) => new Request(file, { cache: 'no-cache' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Every page address is the one page of the game.
  const key = request.mode === 'navigate' ? './' : request;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(key, { ignoreSearch: true });

    // no-cache: always ask the server, not the browser's own short-lived copy.
    const refreshed = fetch(request, { cache: 'no-cache' }).then(async (response) => {
      if (response.ok) await cache.put(key, response.clone());
      return response;
    });
    event.waitUntil(refreshed.catch(() => {}));

    return saved ?? refreshed;
  })());
});
