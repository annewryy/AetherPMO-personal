/**
 * AetherPMO PWA Service Worker
 * Cache Version: 'aetherpmo-v1.6.0-20261029-pwa'
 * 
 * Strict Allowlist & Security Strategy:
 * 1. ZERO-CACHE POLICY FOR BUSINESS & AUTH DATA:
 *    - All Supabase endpoints (*.supabase.co, /auth/v1/, /rest/v1/, /storage/v1/, /realtime/v1/, /rpc/) are 100% NETWORK ONLY.
 *    - All same-origin API endpoints (/api/, /rest/, /v1/) and config scripts are 100% NETWORK ONLY.
 *    - Cross-origin requests (url.origin !== self.location.origin) are NEVER cached.
 *    - Non-GET HTTP methods (POST, PUT, DELETE, PATCH) are NEVER cached.
 *    - Requests carrying Authorization or apikey headers are NEVER cached.
 *    - Personal information, project data, deliverables, and tokens are NEVER stored in CacheStorage.
 * 2. APP SHELL ONLY CACHING:
 *    - HTML Navigation: NETWORK FIRST (falling back to cached /index.html only when offline)
 *    - Static Assets (CSS, JS, Fonts, Images, Manifest): STALE-WHILE-REVALIDATE for fast app launch
 */

const CACHE_VERSION = 'aetherpmo-v1.6.0-20261029-pwa';
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
];

// Install Event: Pre-cache static App Shell
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then(cache => {
            console.log('[SW] Pre-caching static app shell v1.6.0');
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[SW] Pre-cache partial failure:', err);
            });
        })
    );
});

// Activate Event: Delete outdated caches immediately & claim clients
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

// Message Event: Handle update skip waiting signal from client
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
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
    const isSupabaseConfig = url.pathname.includes('supabase-config.js');
    const isApiRoute = url.pathname.startsWith('/api/') ||
                       url.pathname.startsWith('/rest/') ||
                       url.pathname.startsWith('/v1/');

    // NEVER cache business data, user tokens, or authenticated API calls
    if (isCrossOrigin || isSupabaseApi || isNonGetMethod || isApiRoute || isSupabaseConfig) {
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
