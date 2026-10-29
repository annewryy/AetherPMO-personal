/**
 * AetherPMO PWA Service Worker
 * Cache Version: 'aetherpmo-v1.6.1-20261029-secure-pwa'
 * 
 * Strict Allowlist & High-Security Strategy:
 * 1. ZERO-CACHE POLICY FOR BUSINESS & AUTH DATA:
 *    - Requests carrying Authorization, apikey, x-api-key, or x-supabase-auth headers are NEVER cached.
 *    - All Supabase endpoints (*.supabase.co, /auth/v1/, /rest/v1/, /storage/v1/, /realtime/v1/, /rpc/) are 100% NETWORK ONLY.
 *    - All same-origin API endpoints (/api/, /rest/, /v1/) and config scripts are 100% NETWORK ONLY.
 *    - Cross-origin requests (url.origin !== self.location.origin) are NEVER cached.
 *    - Non-GET HTTP methods (POST, PUT, DELETE, PATCH) are NEVER cached.
 *    - Responses with Content-Type: application/json or Cache-Control: no-store/private are NEVER stored in CacheStorage.
 *    - Personal information, project data, deliverables, and tokens are NEVER stored in CacheStorage.
 * 2. EXPLICIT STATIC ALLOWLIST ONLY:
 *    - Only explicitly pre-approved static asset paths (HTML, CSS, core JS, icons, manifest) can be cached.
 *    - Loose file extension patterns are strictly prohibited to prevent caching dynamic JSON/API routes.
 * 3. DATA LOSS PREVENTION ON SW UPDATE:
 *    - Install event does NOT forcefully trigger skipWaiting() during active sessions.
 *    - skipWaiting() is executed only upon explicit client message ('SKIP_WAITING') after user confirmation.
 */

const CACHE_VERSION = 'aetherpmo-v1.6.1-20261029-secure-pwa';
const STATIC_CACHE_NAME = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `dynamic-${CACHE_VERSION}`;

// Explicitly approved static asset URLs (Same-Origin only)
const EXPLICIT_STATIC_PATHS = new Set([
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/ai-automation.js',
    '/manifest.webmanifest',
    '/aetherpmo-icon.svg',
    '/aetherpmo-icon-maskable.svg',
    '/favicon.ico',
    '/favicon.png',
    '/icon-192.png',
    '/icon-192-maskable.png',
    '/icon-512.png',
    '/icon-512-maskable.png',
    '/apple-touch-icon-180.png'
]);

// Core static App Shell assets to pre-cache on install
const STATIC_ASSETS = Array.from(EXPLICIT_STATIC_PATHS);

/**
 * Validates whether a requested pathname is explicitly permitted for caching
 */
function isApprovedStaticAsset(url) {
    if (url.origin !== self.location.origin) return false;
    const pathname = url.pathname;

    // 1. Exact match in explicit static allowlist
    if (EXPLICIT_STATIC_PATHS.has(pathname)) return true;

    // 2. Strict media/font subdirectories (no scripts, no JSON, no query params)
    if (url.search === '' && /^\/(assets|icons|images|fonts)\/[a-zA-Z0-9_\-.\/]+\.(css|png|jpg|jpeg|svg|ico|woff2?|ttf)$/i.test(pathname)) {
        return true;
    }

    return false;
}

/**
 * Validates whether a response is safe to store in CacheStorage
 */
function isSafeToCacheResponse(response) {
    if (!response || response.status !== 200 || response.type !== 'basic') {
        return false;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('application/ld+json')) {
        return false;
    }
    const cacheControl = response.headers.get('cache-control') || '';
    if (cacheControl.includes('no-store') || cacheControl.includes('private')) {
        return false;
    }
    return true;
}

// Install Event: Pre-cache static App Shell without abrupt skipWaiting
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then(cache => {
            console.log('[SW] Pre-caching approved static app shell v1.6.1');
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[SW] Pre-cache partial failure:', err);
            });
        })
    );
});

// Activate Event: Delete outdated caches safely and claim clients
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
                        console.log('[SW] Removing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Message Event: Controlled skipWaiting execution on user approval
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] User approved update: activating new service worker');
        self.skipWaiting();
    }
});

// Fetch Event: Apply strict origin checks, header inspections, explicit allowlists & zero-cache security
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. HARD SECURITY BYPASS: Authentication headers check
    const hasAuthHeader = request.headers.has('authorization') ||
                          request.headers.has('apikey') ||
                          request.headers.has('x-api-key') ||
                          request.headers.has('x-supabase-auth');

    // 2. HARD SECURITY BYPASS: Origin, Supabase, Non-GET, and API routes
    const isCrossOrigin = url.origin !== self.location.origin;
    const isSupabaseApi = url.hostname.includes('supabase.co') ||
                          url.pathname.includes('/auth/v1/') ||
                          url.pathname.includes('/rest/v1/') ||
                          url.pathname.includes('/storage/v1/') ||
                          url.pathname.includes('/realtime/v1/') ||
                          url.pathname.includes('/rpc/');
    const isNonGetMethod = request.method !== 'GET';
    const isSupabaseConfig = url.pathname.includes('supabase-config.js');
    const isApiRoute = url.pathname.startsWith('/api/') ||
                       url.pathname.startsWith('/rest/') ||
                       url.pathname.startsWith('/v1/');

    // NEVER cache business data, user tokens, or authenticated API calls
    if (hasAuthHeader || isCrossOrigin || isSupabaseApi || isNonGetMethod || isApiRoute || isSupabaseConfig) {
        return; // Early return: browser fetches directly over network
    }

    // 3. EXPLICIT STATIC RESOURCE ALLOWLIST FILTERING:
    // Only cache if the URL matches explicit approved static assets
    if (!isApprovedStaticAsset(url)) {
        return; // Non-approved GET request bypassed over network
    }

    // 4. NETWORK FIRST: Navigation & HTML requests (Same-Origin)
    if (request.mode === 'navigate' || request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then(networkResponse => {
                    if (isSafeToCacheResponse(networkResponse)) {
                        const responseClone = networkResponse.clone();
                        caches.open(STATIC_CACHE_NAME).then(cache => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(request).then(cachedResponse => {
                        return cachedResponse || caches.match('/index.html');
                    });
                })
        );
        return;
    }

    // 5. STALE-WHILE-REVALIDATE: Pre-approved static assets (CSS, JS, Images, Fonts, Manifest)
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            const fetchPromise = fetch(request)
                .then(networkResponse => {
                    if (isSafeToCacheResponse(networkResponse)) {
                        const responseClone = networkResponse.clone();
                        caches.open(DYNAMIC_CACHE_NAME).then(cache => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(err => {
                    console.debug('[SW] Fetch failed, serving cache if available:', err);
                });

            return cachedResponse || fetchPromise;
        })
    );
});
