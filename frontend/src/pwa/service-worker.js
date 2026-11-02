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
  if (!STATIC_DESTINATIONS.has(request.destination) && !isStaticData) return

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
