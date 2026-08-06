/**
 * newsme.gr — Service Worker
 * Handles Web Push notifications and notification click events.
 * No aggressive caching — this SW is push-only.
 */

const SITE_ORIGIN = self.location.origin;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Push event ───────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: 'newsme.gr',
        body: event.data.text() || 'Νέα ειδοποίηση',
        url: '/',
      };
    }
  }

  const title = String(data.title || 'newsme.gr').slice(0, 100);
  const body = String(data.body || '').slice(0, 200);
  const url = validateSameOriginUrl(data.url) || '/';
  const icon = data.icon || '/og-default.jpg';
  const badge = data.badge || '/og-default.jpg';
  const tag = data.tag || 'newsme-push';

  const options = {
    body,
    icon,
    badge,
    tag,
    renotify: false,
    requireInteraction: false,
    data: {
      url,
      campaignId: data.campaignId || null,
      articleId: data.articleId || null,
    },
  };

  if (data.image && isHttpsUrl(data.image)) {
    options.image = data.image;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click ───────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const targetUrl = validateSameOriginUrl(notifData.url) || '/';
  const campaignId = notifData.campaignId;

  // Best-effort click tracking — never blocks navigation
  const trackingPromise = campaignId
    ? fetch(`${SITE_ORIGIN}/api/push/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
        keepalive: true,
      }).catch(() => {})
    : Promise.resolve();

  const navigationPromise = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windowClients) => {
      // Focus existing NewsMe tab if open
      for (const client of windowClients) {
        if (client.url.startsWith(SITE_ORIGIN) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    });

  event.waitUntil(Promise.all([trackingPromise, navigationPromise]));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateSameOriginUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url, SITE_ORIGIN);
    if (parsed.origin !== SITE_ORIGIN) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function isHttpsUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
