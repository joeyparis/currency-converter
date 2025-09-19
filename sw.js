// Currency Converter Service Worker
// Version-based caching with aggressive updates
const VERSION = 'v3-' + Date.now(); // Always unique version
const APP_CACHE = `currency-converter-${VERSION}`;
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours max cache

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
      
      // ALWAYS skip waiting - we want immediate updates
      self.skipWaiting();
    } catch (error) {
      console.error('[SW] ❌ Failed to cache app shell:', error);
    }
  })());
});

// Activate event - clean up ALL old caches and claim clients immediately
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
          version: VERSION
        });
      });
      
    } catch (error) {
      console.error('[SW] ❌ Activation failed:', error);
    }
  })());
});

// Fetch event - Network-first with fallback strategy for better updates
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // App shell: Network-first strategy (better for updates)
  const isAppAsset = request.mode === 'navigate' || 
    url.origin === self.location.origin ||
    url.hostname === 'cdn.jsdelivr.net'; // Bootstrap CSS

  if (isAppAsset) {
    event.respondWith((async () => {
      try {
        // Try network FIRST for fresh content
        try {
          console.log(`[SW] 🌐 Network first: ${request.url}`);
          const networkResponse = await fetch(request);
          
          if (networkResponse.ok) {
            const cache = await caches.open(APP_CACHE);
            console.log(`[SW] 💾 Caching fresh: ${request.url}`);
            cache.put(request, networkResponse.clone());
            return networkResponse;
          }
        } catch (networkError) {
          console.log(`[SW] 📶 Network failed for: ${request.url}`);
        }
        
        // Fallback to cache if network fails
        const cache = await caches.open(APP_CACHE);
        const cached = await cache.match(request, { ignoreSearch: true });
        
        if (cached) {
          console.log(`[SW] 💾 Serving cached: ${request.url}`);
          return cached;
        }
        
        // For navigation requests, serve index.html as fallback
        if (request.mode === 'navigate') {
          const fallback = await cache.match('./index.html');
          if (fallback) {
            console.log('[SW] 🏠 Serving index.html fallback');
            return fallback;
          }
        }
        
        throw new Error('No cached version available');
        
      } catch (error) {
        console.error(`[SW] ❌ Fetch failed for ${request.url}:`, error);
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

// Optional: Periodic background sync for rate updates
// (This would require additional setup and registration)
self.addEventListener('sync', (event) => {
  if (event.tag === 'currency-rates-sync') {
    console.log('[SW] Background sync triggered');
    // Could trigger rate updates here
  }
});

// Log service worker errors
self.addEventListener('error', (event) => {
  console.error('[SW] Service worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
});

console.log('[SW] Service worker script loaded');
