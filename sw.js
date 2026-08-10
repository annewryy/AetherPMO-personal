/**
 * AetherPMO PWA Service Worker
 * Caching Strategy:
 * - Supabase API & Auth requests: NETWORK ONLY (never cached)
 * - HTML (index.html): NETWORK FIRST (with offline cache fallback)
 * - Static Assets (CSS, JS, Fonts, Images): STALE-WHILE-REVALIDATE
 * - Automatic cache versioning & cleanup on activate
 */

const CACHE_VERSION = 'aetherpmo-v1.0.1-20260810';
const STATIC_CACHE_NAME = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `dynamic-${CACHE_VERSION}`;

// Core static App Shell assets to pre-cache
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.webmanifest',
    '/favicon.png',
    '/icon-192.png',
    '/icon-512.png'
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

// Fetch Event: Apply strict network vs cache strategies
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. NETWORK ONLY: Supabase API, Auth, and external domain requests
    if (
        url.hostname.includes('supabase.co') ||
        url.pathname.includes('/auth/v1/') ||
        url.pathname.includes('/rest/v1/') ||
        url.pathname.includes('/storage/v1/') ||
        request.method !== 'GET'
    ) {
        return; // Let browser handle network request natively
    }

    // 2. NETWORK FIRST: Navigation & HTML requests
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
                    return caches.match(request).then(cachedResponse => {
                        return cachedResponse || caches.match('/index.html');
                    });
                })
        );
        return;
    }

    // 3. STALE-WHILE-REVALIDATE: Static assets (CSS, JS, Fonts, Images)
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            const fetchPromise = fetch(request)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(DYNAMIC_CACHE_NAME).then(cache => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Ignore network failure for background revalidation
                });

            return cachedResponse || fetchPromise;
        })
    );
});
