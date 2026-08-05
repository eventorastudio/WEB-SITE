const CACHE_NAME = 'eventora-prestige-static-v1';
const STATIC_ASSETS = [
    './', './index.html', './dashboard.html', './check-in.html', './invitados.html', './actividad.html',
    './assets/css/portal.css', './assets/css/components.css', './assets/images/portal-icon.svg', './manifest.webmanifest',
    './config.js', './firebase.js', './core/portal-state.js', './core/portal-ui.js', './core/portal-event-bus.js', './core/portal-event-types.js', './core/access-guard.js', './core/entitlement-guard.js',
    './services/portal-auth-service.js', './services/portal-event-service.js', './services/portal-guest-service.js', './services/checkin-service.js',
    './modules/portal-login.js', './modules/portal-controller.js', './modules/qr-scanner.js', './modules/guest-search.js', './modules/live-stats.js', './modules/checkin-history.js', './modules/connectivity-manager.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const requestUrl = new URL(event.request.url);
    if (requestUrl.origin !== self.location.origin) return;
    if (requestUrl.pathname.includes('/firebase') || requestUrl.pathname.includes('/eventos/') || requestUrl.search) return;
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        if (!response.ok || response.type !== 'basic') return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
    })));
});
