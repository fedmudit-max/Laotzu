const CACHE_NAME = 'king-v64';

const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './constants.js',
    './data.js',
    './migration.js',
    './logic.js',
    './entitlement.js',
    './billing.js',
    './firebase.js',
    './backup.js',
    './ui-main.js',
    './ui-overlays.js',
    './ui-actions.js',
    './ui-history.js',
    './ui-day.js',
    './boot.js',
    './manifest.json',
    './assets/icon-192.png',
    './assets/icon-512.png',
    './assets/icon-192-maskable.png',
    './assets/icon-512-maskable.png',
    './assets/progress-ideal-vs-actual.png',
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) { return cache.addAll(ASSETS); })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.filter(function (k) { return k !== CACHE_NAME; })
                    .map(function (k) { return caches.delete(k); })
            );
        }).then(function () { return self.clients.claim(); })
    );
});

function staleWhileRevalidate(request) {
    return caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(request).then(function (cached) {
            var networkFetch = fetch(request).then(function (response) {
                if (response && response.ok) cache.put(request, response.clone());
                return response;
            }).catch(function () { return null; });
            if (cached) {
                networkFetch.catch(function () {});
                return cached;
            }
            return networkFetch.then(function (response) {
                return response || cache.match(request);
            });
        });
    }).then(function (response) {
        return response || new Response('', { status: 504, statusText: 'Offline' });
    });
}

function cacheFirst(request) {
    return caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(request).then(function (cached) {
            if (cached) return cached;
            return fetch(request).then(function (response) {
                if (response && response.ok) cache.put(request, response.clone());
                return response;
            });
        });
    });
}

self.addEventListener('fetch', function (event) {
    if (event.request.method !== 'GET') return;
    var path = new URL(event.request.url).pathname;
    var isAppFile = /\.(js|css|html|json)$/.test(path);
    event.respondWith(isAppFile ? staleWhileRevalidate(event.request) : cacheFirst(event.request));
});
