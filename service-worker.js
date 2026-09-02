const CACHE_NAME = 'libretto-volo-v1.0.2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './config.js',
  './robots.txt',
  './src/app.js',
  './src/db.js',
  './src/icons.js',
  './src/pdf.js',
  './src/styles.css',
  './src/supabase.js',
  './src/sync.js',
  './src/utils.js',
  './src/xlsx.js',
  './vendor/jszip.min.js',
  './vendor/JSZIP-LICENSE.md',
  './assets/app-icon.svg',
  './assets/app-icon-192.png',
  './assets/app-icon-512.png',
  './assets/cockpit.jpeg',
  './assets/Modello_Libretto.xlsx',
  './assets/Logsummary_esempio.xlsx'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname.endsWith('.supabase.co')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && url.origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
