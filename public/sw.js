/**
 * Service Worker for Mind in a Box
 * Provides offline support for the journal and cached assets
 */

const CACHE_NAME = 'mindinbox-v1';
const STATIC_CACHE = 'mindinbox-static-v1';
const DYNAMIC_CACHE = 'mindinbox-dynamic-v1';

// Assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/enter',
  '/wisdom',
  '/dialogue',
  '/journal',
  '/tracker',
  '/paths',
  '/quotes',
  '/pricing',
  '/privacy',
  '/terms',
  '/favicon/site.webmanifest',
  '/favicon/android-chrome-192x192.png',
  '/favicon/android-chrome-512x512.png',
  '/og.png',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Skip API routes (except for specific ones we want to cache)
  if (url.pathname.startsWith('/api/')) {
    // Allow caching for specific API routes if needed
    if (url.pathname.startsWith('/api/quotes/') || url.pathname.startsWith('/api/auth/')) {
      event.respondWith(networkFirst(request));
      return;
    }
    // Don't intercept other API routes
    return;
  }

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Handle static assets - cache first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Default: network first for everything else
  event.respondWith(networkFirst(request));
});

// Cache-first strategy for static assets
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Network-first strategy for dynamic content
async function networkFirst(request) {
  const cache = await caches.open(DYNAMIC_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlineResponse = await cache.match('/');
      if (offlineResponse) {
        return offlineResponse;
      }
    }

    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Check if URL is a static asset
function isStaticAsset(pathname) {
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.ico', '.png'];
  return staticExtensions.some(ext => pathname.endsWith(ext)) ||
         pathname.startsWith('/_next/static/') ||
         pathname.startsWith('/_next/image') ||
         pathname.startsWith('/images/') ||
         pathname.startsWith('/art/') ||
         pathname.startsWith('/favicon/') ||
         pathname.startsWith('/fonts/');
}

// Background sync for journal entries
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-journal') {
    event.waitUntil(syncJournalEntries());
  }
});

async function syncJournalEntries() {
  // This would sync pending journal entries to Firebase when online
  // Implementation depends on the app's sync mechanism
  console.log('Background sync: syncing journal entries');
}

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data === 'syncJournal') {
    event.waitUntil(syncJournalEntries());
  }
});