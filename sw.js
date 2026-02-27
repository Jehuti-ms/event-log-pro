// sw.js - Service Worker for Event Log Pro
const CACHE_NAME = 'event-log-pro-v2'; // Increment version to force update
const urlsToCache = [
  '/event-log-pro/',
  '/event-log-pro/index.html',
  '/event-log-pro/styles.css',
  '/event-log-pro/app.js',
  '/event-log-pro/manifest.json',
  '/event-log-pro/icon.svg',
  '/event-log-pro/icon-192.png',
  '/event-log-pro/icon-512.png'
];

// Install service worker
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache opened');
        return cache.addAll(urlsToCache).catch(error => {
          console.error('Failed to cache some resources:', error);
          // Still continue even if some resources fail
        });
      })
  );
  self.skipWaiting();
});

// Activate and clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, then cache
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200) {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          })
          .catch(err => console.log('Cache put error:', err));

        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request);
      })
  );
});
