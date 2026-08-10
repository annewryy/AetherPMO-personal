/**
 * AetherPMO PWA Service Worker
 * Manual Cache Version Constant: 'aetherpmo-v1.0.3-20260810'
 * 
 * Strict Allowlist & Bypass Strategy:
 * 1. NETWORK ONLY BYPASS:
 *    - Cross-origin requests (url.origin !== self.location.origin)
 *    - Supabase API endpoints (*.supabase.co, /auth/v1/, /rest/v1/, /storage/v1/, /realtime/v1/, /rpc/)
 *    - Non-GET HTTP methods (POST, PUT, DELETE, PATCH, etc.)
 *    - Same-origin API endpoints (/api/, /rest/, /v1/, dynamic JSON endpoints)
 *    - Non-static asset GET requests not matching explicit Static Resource Allowlist
 * 2. NETWORK FIRST: Same-Origin HTML Navigation requests
 * 3. STALE-WHILE-REVALIDATE: Same-Origin Static App Shell Assets (CSS, JS, Fonts, Images, Manifest)
 */

const CACHE_VERSION = 'aetherpmo-v1.0.3-20260810';
const STATIC_CACHE_NAME = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `dynamic-${CACHE_VERSION}`;

// Explicit Static Resource Allowlist Definitions
const ALLOWED_DESTINATIONS = ['document', 'style', 'script', 'image', 'font', 'manifest'];
const ALLOWED_EXTENSIONS = /\.(html|css|js|png|jpg|jpeg|svg|ico|json|webmanifest|woff2?|ttf|eot)$/i;

// Core static App Shell assets to pre-cache (Same-Origin only)
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.webmanifest',
    '/favicon.png',
    '/icon-192.png',
    '/icon-192-maskable.png',
    '/icon-512.png',
    '/icon-512-maskable.png',
    '/apple-touch-icon-180.png'
];

// Install Event: Pre-cache static App Shell
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then(cache => {
            console.log('[SW] Pre-caching static app shell');
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[SW] Pre-cache partial failure:', err);
            });
        })
    );
});

// Activate Event: Delete outdated caches immediately
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

// Fetch Event: Apply strict origin checks, static allowlists & network vs cache strategies
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. HARD BYPASS: Cross-origin, Supabase, Non-GET, and API routes
    const isCrossOrigin = url.origin !== self.location.origin;
    const isSupabaseApi = url.hostname.includes('supabase.co') ||
                          url.pathname.includes('/auth/v1/') ||
                          url.pathname.includes('/rest/v1/') ||
                          url.pathname.includes('/storage/v1/') ||
                          url.pathname.includes('/realtime/v1/') ||
                          url.pathname.includes('/rpc/');
    const isNonGetMethod = request.method !== 'GET';
    const isApiRoute = url.pathname.startsWith('/api/') ||
                       url.pathname.startsWith('/rest/') ||
                       url.pathname.startsWith('/v1/');

    if (isCrossOrigin || isSupabaseApi || isNonGetMethod || isApiRoute) {
        return; // Early return without event.respondWith(), browser fetches directly over network
    }

    // 2. STATIC RESOURCE ALLOWLIST FILTERING:
    // Only cache if request destination or file extension belongs to the static asset allowlist
    const isAllowedDestination = ALLOWED_DESTINATIONS.includes(request.destination);
    const isAllowedExtension = ALLOWED_EXTENSIONS.test(url.pathname);

    if (!isAllowedDestination && !isAllowedExtension) {
        return; // Non-static GET request bypassed over network
    }

    // 3. NETWORK FIRST: Navigation & HTML requests (Same-Origin)
    if (request.mode === 'navigate' || request.destination === 'document' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
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

    // 4. STALE-WHILE-REVALIDATE: Allowed static assets (CSS, JS, Images, Fonts, Manifest)
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            const fetchPromise = fetch(request)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
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
