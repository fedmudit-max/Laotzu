const CACHE_NAME = 'king-v52';

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
    './reminders.js',
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
];

// ── Local daily reminder (best-effort timers inside the SW) ──
var __swReminderTimer = null;
var __swReminderCfg = null;

function clearSwReminderTimer() {
    if (__swReminderTimer) {
        clearTimeout(__swReminderTimer);
        __swReminderTimer = null;
    }
}

function nextDayAt(hour, minute, fromMs) {
    var base = fromMs != null ? fromMs : Date.now();
    var d = new Date(base);
    d.setSeconds(0, 0);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= base + 20000) {
        d.setDate(d.getDate() + 1);
    }
    return d.getTime();
}

function scheduleSwReminder(cfg) {
    clearSwReminderTimer();
    if (!cfg || !cfg.enabled) {
        __swReminderCfg = null;
        return;
    }
    __swReminderCfg = {
        enabled: true,
        hour: cfg.hour,
        minute: cfg.minute,
        title: cfg.title || 'King check-in',
        body: cfg.body || 'Log today — one honest day keeps the journey moving.',
        nextAt: cfg.nextAt || nextDayAt(cfg.hour, cfg.minute),
    };
    var delay = Math.max(0, __swReminderCfg.nextAt - Date.now());
    __swReminderTimer = setTimeout(function () {
        __swReminderTimer = null;
        var active = __swReminderCfg;
        if (!active || !active.enabled) return;
        self.registration.showNotification(active.title, {
            body: active.body,
            icon: './assets/icon-192.png',
            badge: './assets/icon-192.png',
            tag: 'king-daily-reminder',
            renotify: true,
            data: { url: './index.html' },
        }).catch(function () {}).then(function () {
            if (!__swReminderCfg || !__swReminderCfg.enabled) return;
            scheduleSwReminder({
                enabled: true,
                hour: active.hour,
                minute: active.minute,
                title: active.title,
                body: active.body,
                nextAt: nextDayAt(active.hour, active.minute, Date.now()),
            });
        });
    }, delay);
}

self.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'SCHEDULE_REMINDER') {
        scheduleSwReminder(data);
    } else if (data.type === 'CANCEL_REMINDER') {
        clearSwReminderTimer();
        __swReminderCfg = null;
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var target = (event.notification.data && event.notification.data.url) || './index.html';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
            for (var i = 0; i < list.length; i++) {
                var client = list[i];
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(target);
        })
    );
});

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
    return caches.match(request).then(function (cached) {
        return cached || fetch(request);
    });
}

self.addEventListener('fetch', function (event) {
    if (event.request.method !== 'GET') return;
    var path = new URL(event.request.url).pathname;
    var isAppFile = /\.(js|css|html|json)$/.test(path);
    event.respondWith(isAppFile ? staleWhileRevalidate(event.request) : cacheFirst(event.request));
});
