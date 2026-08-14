const CACHE_NAME = 'vespatimer-v2-' + Date.now();
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
];

// Map tile cache with dynamic handling
const MAP_TILE_CACHE = 'vespatimer-tiles-v2';

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing VespaTimer v2.0...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .catch((error) => console.log('[SW] Cache failed:', error))
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== MAP_TILE_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  // Handle map tiles separately for offline caching
  if (event.request.url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          
          return fetch(event.request)
            .then((response) => {
              if (!response || response.status !== 200) return response;
              
              const responseToCache = response.clone();
              caches.open(MAP_TILE_CACHE)
                .then((cache) => cache.put(event.request, responseToCache))
                .catch(() => {
                  // If tile cache is full, delete oldest entries
                  caches.open(MAP_TILE_CACHE).then((cache) => {
                    cache.keys().then((keys) => {
                      if (keys.length > 200) {
                        // Delete oldest 50 tiles
                        for (let i = 0; i < 50; i++) {
                          cache.delete(keys[i]);
                        }
                      }
                    });
                  });
                });
              
              return response;
            })
            .catch(() => {
              // Return a placeholder for offline map tiles
              return new Response('', { status: 204 });
            });
        })
    );
    return;
  }

  // Handle all other requests
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        
        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') return response;
            
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache));
            
            return response;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') return caches.match('./index.html');
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    console.log('[SW] Skip waiting');
    self.skipWaiting();
  }
});
