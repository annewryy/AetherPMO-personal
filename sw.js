/**
 * AetherPMO PWA Service Worker
 * Manual Cache Version Constant: 'aetherpmo-v1.0.2-20260810'
 * 
 * Strict Bypass & Caching Strategy:
 * 1. NETWORK ONLY (Bypass SW respondWith completely):
 *    - Cross-origin requests (url.origin !== self.location.origin)
 *    - Supabase API endpoints (*.supabase.co, /auth/v1/, /rest/v1/, /storage/v1/, /realtime/v1/, /rpc/)
 *    - Any non-GET HTTP methods (POST, PUT, DELETE, PATCH)
 * 2. NETWORK FIRST: Navigation & HTML document requests
 * 3. STALE-WHILE-REVALIDATE: Same-origin static App Shell assets (CSS, JS, Fonts, Images)
 */

const CACHE_VERSION = 'aetherpmo-v1.0.2-20260810';
const STATIC_CACHE_NAME = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `dynamic-${CACHE_VERSION}`;

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

// Fetch Event: Apply strict origin checks & network vs cache strategies
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. NETWORK ONLY BYPASS:
    // - Cross-origin requests (url.origin !== self.location.origin)
    // - Supabase API endpoints (*.supabase.co, /auth/v1/, /rest/v1/, /storage/v1/, /realtime/v1/, /rpc/)
    // - Any non-GET requests (POST, PUT, DELETE, PATCH, etc.)
    if (
        url.origin !== self.location.origin ||
        url.hostname.includes('supabase.co') ||
        url.pathname.includes('/auth/v1/') ||
        url.pathname.includes('/rest/v1/') ||
        url.pathname.includes('/storage/v1/') ||
        url.pathname.includes('/realtime/v1/') ||
        url.pathname.includes('/rpc/') ||
        request.method !== 'GET'
    ) {
        return; // Early return without event.respondWith(), browser handles request directly over network
    }

    // 2. NETWORK FIRST: Navigation & HTML requests (Same-Origin)
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
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
                    // Offline fallback to cached HTML
                    return caches.match(request).then(cachedResponse => {
                        return cachedResponse || caches.match('/index.html');
                    });
                })
        );
        return;
    }

    // 3. STALE-WHILE-REVALIDATE: Same-origin static GET assets (CSS, JS, Images, Fonts)
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
