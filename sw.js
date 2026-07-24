// Minimal service worker — just enough to make the site installable as an app.
// Caches the core files so the app shell loads instantly on repeat visits.

const CACHE_NAME = 'duo-chat-v6';
const CORE_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first for Firebase/Cloudinary calls (always want fresh data),
  // cache-first for the app shell files themselves.
  const url = event.request.url;
  const isAppShell = CORE_FILES.some((f) => url.endsWith(f.replace('./', '')));

  if (isAppShell) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
  // All other requests (Firebase, Cloudinary, fonts) just go to the network as normal.
});
