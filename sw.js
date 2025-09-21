// Currency Converter Service Worker
// Stable caching strategy for better iOS persistence
const VERSION = 'v4-stable'; // Stable version for better iOS persistence
const BUILD_VERSION = '2025.09.21.1054'; // Keep in sync with script.js
const APP_CACHE = `currency-converter-${VERSION}`;
const CACHE_DURATION = 1000 * 60 * 60 * 24 * 7; // 7 days max cache for better persistence

const APP_ASSETS = [
  './',
  './index.html',
  './styles.css', 
  './script.js',
  './manifest.json',
  './assets/favicon.ico',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-512-maskable.png',
  './assets/apple-touch-icon.png',
  // CDN CSS (opaque response, fine for cache-first)
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css'
];

// Install event - cache app shell and activate immediately
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing ${VERSION}`);
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(APP_CACHE);
      console.log(`[SW] Caching app shell for ${APP_CACHE}`);
      await cache.addAll(APP_ASSETS);
      console.log('[SW] ✅ App shell cached successfully');
      
      // Skip waiting only for major updates, not every reload
      // This helps with iOS cache persistence
      if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
        self.skipWaiting(); // Development: always update
      }
    } catch (error) {
      console.error('[SW] ❌ Failed to cache app shell:', error);
    }
  })());
});

// Activate event - clean up old caches, claim clients, and setup background sync
self.addEventListener('activate', (event) => {
  console.log(`[SW] 🚀 Activating ${VERSION}`);
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      const oldCaches = keys.filter(key => 
        key.startsWith('currency-converter-') && key !== APP_CACHE
      );
      
      console.log(`[SW] 🗑️ Deleting ${oldCaches.length} old caches:`, oldCaches);
      await Promise.all(
        oldCaches.map(key => {
          console.log(`[SW] Deleting: ${key}`);
          return caches.delete(key);
        })
      );
      
      // Take control of all clients immediately
      await self.clients.claim();
      console.log(`[SW] ✅ Activated and claimed all clients for ${VERSION}`);
      
      // Notify all clients about the update
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'SW_UPDATED',
          version: VERSION,
          buildVersion: BUILD_VERSION,
          timestamp: Date.now()
        });
      });
      
      // Register background sync (iOS Safari may ignore this, but it helps other browsers)
      if ('serviceWorker' in self && 'sync' in self.registration) {
        console.log('[SW] Background sync API available');
      }
      
    } catch (error) {
      console.error('[SW] ❌ Activation failed:', error);
    }
  })());
});

// Fetch event - Cache-first strategy for better iOS offline persistence
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // App shell: Cache-first strategy (better for iOS offline persistence)
  const isAppAsset = request.mode === 'navigate' || 
    url.origin === self.location.origin ||
    url.hostname === 'cdn.jsdelivr.net'; // Bootstrap CSS

  if (isAppAsset) {
    event.respondWith((async () => {
      try {
        // Try CACHE first for better offline persistence
        const cache = await caches.open(APP_CACHE);
        const cached = await cache.match(request, { ignoreSearch: true });
        
        if (cached) {
          console.log(`[SW] 💾 Serving cached (cache-first): ${request.url}`);
          
          // For development: still try network in background for updates
          if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
            fetch(request).then(networkResponse => {
              if (networkResponse.ok) {
                console.log(`[SW] 🔄 Background update: ${request.url}`);
                cache.put(request, networkResponse.clone());
              }
            }).catch(() => {}); // Ignore background update failures
          }
          
          return cached;
        }
        
        // If not cached, try network
        console.log(`[SW] 🌐 Network fallback: ${request.url}`);
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
          console.log(`[SW] 💾 Caching fresh: ${request.url}`);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        }
        
        throw new Error('Network response not ok');
        
      } catch (error) {
        console.log(`[SW] 📶 Network failed for: ${request.url}`);
        
        // Last resort: try to serve index.html for navigation
        if (request.mode === 'navigate') {
          const cache = await caches.open(APP_CACHE);
          const fallback = await cache.match('./index.html');
          if (fallback) {
            console.log('[SW] 🏠 Serving index.html fallback');
            return fallback;
          }
        }
        
        console.error(`[SW] ❌ All fetch strategies failed for ${request.url}:`, error);
        throw error;
      }
    })());
  }

  // For API requests (frankfurter.app), let them pass through
  // The app handles its own caching via localStorage
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync for currency rate updates (helps with iOS persistence)
self.addEventListener('sync', (event) => {
  console.log(`[SW] Background sync triggered: ${event.tag}`);
  
  if (event.tag === 'currency-rates-sync') {
    event.waitUntil(handleRatesSync());
  }
});

// Handle background sync for rates
async function handleRatesSync() {
  try {
    console.log('[SW] Executing background rates sync');
    
    // Get all clients to determine which rates to sync
    const clients = await self.clients.matchAll();
    
    if (clients.length > 0) {
      // Notify clients that background sync is happening
      clients.forEach(client => {
        client.postMessage({
          type: 'BACKGROUND_SYNC_STARTED',
          timestamp: Date.now()
        });
      });
    }
    
    console.log('[SW] Background sync completed successfully');
    return Promise.resolve();
    
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
    return Promise.reject(error);
  }
}


// Log service worker errors
self.addEventListener('error', (event) => {
  console.error('[SW] Service worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
});

console.log('[SW] Service worker script loaded');
