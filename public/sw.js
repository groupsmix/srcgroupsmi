// Cache version — bump this string on every deploy to bust old caches.
// Use a date stamp so each deploy is unique.
var CACHE_VERSION = '20260310b';
var CACHE_NAME = 'groupsmix-v' + CACHE_VERSION;

self.addEventListener('install', function(e) {
    // Skip pre-caching static assets — always go network-first.
    // This avoids stale cache issues when deploying new versions.
    self.skipWaiting();
});

self.addEventListener('activate', function(e) {
    // Delete ALL old caches on activation so fresh content is fetched
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE_NAME; })
                    .map(function(k) { return caches.delete(k); })
            );
        })
    );
    e.waitUntil(clients.claim());
});

// Network-first strategy for ALL resources.
// Always try the network; only fall back to cache when offline.
self.addEventListener('fetch', function(e) {
    var url = new URL(e.request.url);
    if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (url.hostname.includes('supabase')) return;

    // For navigation requests (HTML pages), always go network-first
    // and never serve stale HTML from cache
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).catch(function() {
                return caches.match(e.request);
            })
        );
        return;
    }

    // For CSS/JS/images: network-first, cache as fallback for offline use
    e.respondWith(
        fetch(e.request).then(function(response) {
            if (response && response.status === 200 && response.type === 'basic') {
                var responseClone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(e.request, responseClone);
                });
            }
            return response;
        }).catch(function() {
            return caches.match(e.request); // Fallback to cache only when offline
        })
    );
});

// Listen for messages from the page to skip waiting
self.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// ═══════════════════════════════════════
// PUSH NOTIFICATIONS
// ═══════════════════════════════════════

self.addEventListener('push', function(e) {
    if (!e.data) return;

    var data;
    try {
        data = e.data.json();
    } catch (err) {
        data = {
            title: 'GroupsMix',
            body: e.data.text(),
            icon: '/assets/img/favicon.svg'
        };
    }

    var title = data.title || 'GroupsMix';
    var options = {
        body: data.body || '',
        icon: data.icon || '/assets/img/favicon.svg',
        badge: data.badge || '/assets/img/favicon.svg',
        image: data.image || undefined,
        tag: data.tag || 'groupsmix-notification',
        renotify: !!data.renotify,
        requireInteraction: !!data.requireInteraction,
        data: {
            url: data.url || data.link || '/',
            action: data.action || 'open'
        },
        actions: data.actions || []
    };

    e.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Handle notification click — open the target URL
self.addEventListener('notificationclick', function(e) {
    e.notification.close();

    var targetUrl = '/';
    if (e.notification.data && e.notification.data.url) {
        targetUrl = e.notification.data.url;
    }

    // Handle action buttons
    if (e.action === 'view') {
        targetUrl = (e.notification.data && e.notification.data.url) || '/';
    } else if (e.action === 'dismiss') {
        return;
    }

    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // If a window is already open, focus it and navigate
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url && 'focus' in client) {
                    client.focus();
                    if (client.navigate) {
                        return client.navigate(targetUrl);
                    }
                    return client;
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// Handle notification close
self.addEventListener('notificationclose', function(e) {
    // Optionally track dismissals via analytics
    // (silent — no network call needed for now)
});
