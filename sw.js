/*
 * Offline support and instant opening for Saphal Manifest.
 *
 * Every release is stamped with a build id. On install this worker saves the whole
 * app for that build, so the app opens from the device at once with no wait for
 * the network. A new release arrives as a new worker with a new build id; it
 * saves the new files, takes over, and the open page reloads itself.
 *
 * This address is shared with other projects. This worker therefore only ever
 * touches caches whose names begin with its own prefix, and only answers requests
 * for files inside its own folder.
 */
const PREFIX = 'saphal-manifest-';
const BUILD = '20261116-121835';
const CACHE = PREFIX + BUILD;
const BASE = new URL('./', self.location).pathname;
const INDEX = BASE + 'index.html';
const FILES = ["assets/fraunces-latin-full-normal-CFFu7zhK.woff2","assets/index-F8TarCFH.css","assets/index-qVor3Udx.js","assets/screens-DFR9EwhC.js","icon-192.png","icon.svg","index.html","manifest.webmanifest"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const files = Array.isArray(FILES) ? FILES : ['index.html'];
      // Files under assets/ carry a fingerprint in their name, so a copy the browser
      // already holds is the right one and is reused instead of downloaded twice.
      // Everything else is asked for with this build's id attached. The hosting
      // service keeps handing out its previous copy of a file for up to ten minutes
      // after a release; the build id makes it a different address, so the copy
      // saved here is always the one that belongs to this build.
      await Promise.all(
        files.map(async (file) => {
          const fingerprinted = file.startsWith('assets/');
          const response = await fetch(fingerprinted ? BASE + file : `${BASE}${file}?v=${BUILD}`, {
            cache: fingerprinted ? 'default' : 'reload',
          });
          if (!response.ok) throw new Error(`Could not save ${file}`);
          await cache.put(BASE + file, response);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const old = keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE);
      await Promise.all(old.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  // The version check must always reach the network, never a saved copy.
  if (url.pathname === BASE + 'version.json') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const saved = await cache.match(INDEX);
        return saved || fetch(request);
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const saved = await cache.match(request);
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })(),
  );
});
