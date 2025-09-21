// Currency Converter Service Worker
// Stable caching strategy for better iOS persistence
const VERSION = 'v4-stable'; // Stable version for better iOS persistence
const BUILD_VERSION = '2025.09.21.1108'; // Keep in sync with script.js
const APP_CACHE = `currency-converter-${VERSION}`;
const CACHE_DURATION = 1000 * 60 * 60 * 24 * 7; // 7 days max cache for better persistence

const APP_ASSETS = [
  // Use absolute paths for better iOS PWA compatibility
  '/currency-converter/',
  '/currency-converter/index.html',
  '/currency-converter/offline.html', // CRITICAL: Offline fallback page
  '/currency-converter/styles.css', 
  '/currency-converter/script.js',
  '/currency-converter/manifest.json',
  '/currency-converter/assets/favicon.ico',
  '/currency-converter/assets/icon-192.png',
  '/currency-converter/assets/icon-512.png',
  '/currency-converter/assets/icon-512-maskable.png',
  '/currency-converter/assets/apple-touch-icon.png',
  // Also cache relative paths for local development
  './',
  './index.html',
  './offline.html', // CRITICAL: Offline fallback page (relative)
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

// Install event - cache app shell with iOS PWA optimizations
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing ${VERSION}`);
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(APP_CACHE);
      console.log(`[SW] Caching app shell for ${APP_CACHE}`);
      
      // Cache assets individually for better error handling
      const cachePromises = [];
      
      for (const asset of APP_ASSETS) {
        cachePromises.push(
          fetch(asset)
            .then(response => {
              if (response.ok) {
                console.log(`[SW] ✅ Cached: ${asset}`);
                return cache.put(asset, response);
              } else {
                console.warn(`[SW] ⚠️ Failed to fetch: ${asset} (${response.status})`);
                return null;
              }
            })
            .catch(error => {
              console.warn(`[SW] ⚠️ Cache error for ${asset}:`, error);
              return null;
            })
        );
      }
      
      // Wait for critical assets, but don't fail if some assets don't load
      await Promise.allSettled(cachePromises);
      console.log('[SW] ✅ App shell caching completed (some assets may have failed)');
      
      // Always skip waiting for development
      if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
        console.log('[SW] Development mode: skipping waiting');
        self.skipWaiting();
      } else {
        // For production, skip waiting to ensure iOS PWA updates immediately
        console.log('[SW] Production mode: skipping waiting for iOS PWA compatibility');
        self.skipWaiting();
      }
      
    } catch (error) {
      console.error('[SW] ❌ Failed to cache app shell:', error);
      // Don't throw - let the installation succeed even if caching fails
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
      
      // Debug cache contents after activation (for iOS troubleshooting)
      setTimeout(debugCacheContents, 1000);
      
    } catch (error) {
      console.error('[SW] ❌ Activation failed:', error);
    }
  })());
});

// Fetch event - Cache-first strategy optimized for iOS PWA
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip non-HTTP requests (chrome-extension://, moz-extension://, etc.)
  if (!url.protocol.startsWith('http')) return;

  // App shell: Cache-first strategy (better for iOS offline persistence)
  const isAppAsset = request.mode === 'navigate' || 
    url.origin === self.location.origin ||
    url.hostname === 'cdn.jsdelivr.net'; // Bootstrap CSS

  if (isAppAsset) {
    event.respondWith((async () => {
      try {
        console.log(`[SW] 🔎 Handling request: ${request.url} (mode: ${request.mode})`);
        
        const cache = await caches.open(APP_CACHE);
        
        // Try multiple cache matching strategies for iOS PWA compatibility
        let cached = null;
        
        // Strategy 1: Exact match
        cached = await cache.match(request, { ignoreSearch: true });
        
        // Strategy 2: For navigation, try multiple fallbacks
        if (!cached && request.mode === 'navigate') {
          const fallbackPaths = [
            '/currency-converter/', // CRITICAL: Must match manifest start_url exactly
            '/currency-converter/index.html',
            './index.html',
            './'
          ];
          
          for (const path of fallbackPaths) {
            cached = await cache.match(path);
            if (cached) {
              console.log(`[SW] 🎯 Navigation fallback found: ${path}`);
              break;
            }
          }
        }
        
        // Strategy 3: For same-origin requests, try relative path matching
        if (!cached && url.origin === self.location.origin) {
          const relativePath = './' + url.pathname.split('/').pop();
          cached = await cache.match(relativePath);
          if (cached) {
            console.log(`[SW] 🔄 Relative match found: ${relativePath}`);
          }
        }
        
        if (cached) {
          console.log(`[SW] 💾 Serving cached: ${request.url}`);
          
          // For production: still try network in background for critical assets
          if (request.mode === 'navigate' || request.url.includes('.js') || request.url.includes('.css')) {
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
          // Cache with both the original request and a normalized version
          await cache.put(request, networkResponse.clone());
          
          // For navigation requests, cache multiple variations for iOS PWA compatibility
          if (request.mode === 'navigate') {
            // Cache as index.html for relative path access
            await cache.put('./index.html', networkResponse.clone());
            // CRITICAL: Cache as exact start_url from manifest
            await cache.put('/currency-converter/', networkResponse.clone());
            // Cache as start_url with index.html
            await cache.put('/currency-converter/index.html', networkResponse.clone());
          }
          
          return networkResponse;
        }
        
        throw new Error(`Network response not ok: ${networkResponse.status}`);
        
      } catch (error) {
        console.error(`[SW] ❌ Fetch failed for: ${request.url}`, error);
        
        // Emergency fallback for navigation requests
        if (request.mode === 'navigate') {
          console.log('[SW] 🊑 Emergency navigation fallback');
          
          const cache = await caches.open(APP_CACHE);
          const emergencyPaths = [
            './offline.html', // PRIORITY: Use dedicated offline page
            '/currency-converter/offline.html', // Absolute path version
            './index.html', // Fallback to main page
            '/currency-converter/index.html', 
            '/currency-converter/',
            './'
          ];
          
          for (const path of emergencyPaths) {
            const fallback = await cache.match(path);
            if (fallback) {
              console.log(`[SW] 🏠 Emergency fallback served: ${path}`);
              return fallback;
            }
          }
          
          // If all else fails, create a minimal HTML response
          return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Currency Converter - Offline</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
            </head>
            <body>
              <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
                <h1>Currency Converter</h1>
                <p>Unable to load the app offline. Please check your connection and try again.</p>
                <button onclick="window.location.reload()" style="padding: 10px 20px; font-size: 16px;">Retry</button>
              </div>
            </body>
            </html>
          `, {
            status: 200,
            headers: {
              'Content-Type': 'text/html',
              'Cache-Control': 'no-cache'
            }
          });
        }
        
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

// Debug function to inspect cache contents
async function debugCacheContents() {
  try {
    const cache = await caches.open(APP_CACHE);
    const requests = await cache.keys();
    console.log(`[SW] 🔍 Cache contains ${requests.length} items:`);
    requests.forEach(req => console.log(`[SW]   - ${req.url}`));
  } catch (error) {
    console.error('[SW] Failed to inspect cache:', error);
  }
}

// Expose debug function to window for testing
self.debugCache = debugCacheContents;

console.log('[SW] Service worker script loaded');
console.log('[SW] Debug cache contents with: self.debugCache()');

