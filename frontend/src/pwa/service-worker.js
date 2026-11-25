const CACHE_PREFIX = 'nusgo-pwa-'
const CACHE_NAME = __NUSGO_PWA_CACHE_NAME__
const PRECACHE_URLS = __NUSGO_PWA_PRECACHE_URLS__
const STATIC_DESTINATIONS = new Set(['font', 'image', 'manifest', 'script', 'style', 'worker'])

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

// Push payloads are untrusted input from the server, so each field is bounded and only
// app-relative deep links are allowed. A malformed payload shows nothing rather than a
// notification with attacker-controlled text or a redirect.
const PUSH_TOPICS = new Set(['service-updates', 'alight-reminders'])

function parsePushPayload(data) {
  if (!data || typeof data !== 'object') return null

  const bounded = (value, maxLength) => {
    if (typeof value !== 'string') return null
    const text = value.trim()
    return text.length === 0 || text.length > maxLength ? null : text
  }
  const title = bounded(data.title, 80)
  const body = bounded(data.body, 160)
  const tag = bounded(data.tag, 128)
  const topic = PUSH_TOPICS.has(data.topic) ? data.topic : null
  const url = typeof data.url === 'string' && /^\?[A-Za-z0-9._%=&-]*$/.test(data.url) ? data.url : null
  if (!title || !body || !tag || !topic || url === null) return null

  return { title, body, tag, topic, url }
}

// Notification icons are optional: a missing icon must not stop the notification appearing.
function notificationIcon() {
  try {
    return { icon: new URL('./icons/pwa-icon-192.png', self.registration.scope).href }
  } catch {
    return {}
  }
}

self.addEventListener('push', (event) => {
  let input = null
  try {
    input = event.data ? event.data.json() : null
  } catch {
    input = null
  }
  const payload = parsePushPayload(input)
  if (!payload) return

  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    renotify: true,
    data: { url: payload.url, topic: payload.topic },
    ...notificationIcon(),
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url
  if (typeof url !== 'string' || !/^\?[A-Za-z0-9._%=&-]*$/.test(url)) return

  // Resolve against the worker scope so a subpath deployment opens inside its own app.
  const target = new URL(url, self.registration.scope).href
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // An installed app usually already has a window; focus it and hand it the link so the app
    // can open the stop without a full reload.
    for (const client of clients) {
      if (new URL(client.url).origin !== self.location.origin) continue
      if ('focus' in client) {
        await client.focus()
        client.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', url })
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target)
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.split('/').some((segment) => segment.toLowerCase() === 'api')) return

  const scope = new URL(self.registration.scope)
  if (!url.pathname.startsWith(scope.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(appShellFirst(request, new URL('./', scope).href))
    return
  }

  const pathWithinScope = url.pathname.slice(scope.pathname.length)
  const isStaticData = pathWithinScope.split('/').includes('data')
  const isReleaseHistory = pathWithinScope === 'releases/index.json'
  if (!STATIC_DESTINATIONS.has(request.destination) && !isStaticData && !isReleaseHistory) return

  event.respondWith(cacheFirst(request))
})

async function appShellFirst(request, appShellUrl) {
  const cache = await caches.open(CACHE_NAME)
  const appShell = await cache.match(appShellUrl, { ignoreVary: true })
  // Keep HTML paired with this worker's versioned assets, without a network wait.
  if (appShell) return appShell

  try {
    return await fetch(request)
  } catch {
    return new Response('NUSGo is offline. Connect to the internet to load the app.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request, { ignoreVary: true })
  if (cached) return cached

  try {
    const response = await fetch(request)
    const noStore = /\bno-store\b/i.test(response.headers.get('Cache-Control') ?? '')
    if (response.status === 200 && !noStore) {
      try {
        await cache.put(request, response.clone())
      } catch (error) {
        // Storage limits must not discard an otherwise successful download.
        console.warn('NUSGo could not cache a downloaded asset.', error)
      }
    }
    return response
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' })
  }
}
