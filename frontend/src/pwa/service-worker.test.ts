import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { parsePushNotificationPayload } from '@nusgo/shared'

function worker(cached: Response | undefined, fetch = vi.fn(() => new Promise<Response>(() => {}))) {
  const handlers = new Map<string, (event: unknown) => void>()
  const cache = { match: vi.fn(async () => cached), put: vi.fn() }
  runInNewContext(readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8'), {
    __NUSGO_PWA_CACHE_NAME__: 'nusgo-pwa-test',
    __NUSGO_PWA_PRECACHE_URLS__: [],
    self: {
      location: { origin: 'https://nusgo.test' },
      registration: { scope: 'https://nusgo.test/pwa/' },
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
    },
    caches: { open: async () => cache }, fetch, URL, Response, console: { warn: vi.fn() },
  })
  function navigate(path = '/pwa/') {
    let response: Promise<Response> | undefined
    handlers.get('fetch')?.({
      request: { url: `https://nusgo.test${path}`, method: 'GET', mode: 'navigate' },
      respondWith: (value: Promise<Response>) => { response = value },
    })
    return response
  }
  function asset() {
    let response: Promise<Response> | undefined
    handlers.get('fetch')?.({
      request: { url: 'https://nusgo.test/pwa/extra.png', method: 'GET', destination: 'image' },
      respondWith: (value: Promise<Response>) => { response = value },
    })
    return response
  }
  function releaseIndex() {
    let response: Promise<Response> | undefined
    handlers.get('fetch')?.({
      request: { url: 'https://nusgo.test/pwa/releases/index.json', method: 'GET', destination: '', mode: 'cors' },
      respondWith: (value: Promise<Response>) => { response = value },
    })
    return response
  }
  return { navigate, asset, releaseIndex, fetch, cache }
}

describe('offline app launch', () => {
  it('delivers the cached shell without waiting for an unresponsive network', async () => {
    const shell = new Response('cached app')
    const runtime = worker(shell)
    const result = await Promise.race([
      runtime.navigate('/pwa/stops'),
      new Promise<string>((resolve) => setTimeout(() => resolve('still loading'), 50)),
    ])
    expect(result).toBe(shell)
    expect(runtime.fetch).not.toHaveBeenCalled()
  })

  it('does not intercept API or out-of-scope navigation', () => {
    const runtime = worker(new Response('cached app'))
    expect(runtime.navigate('/pwa/api/arrivals')).toBeUndefined()
    expect(runtime.navigate('/other/')).toBeUndefined()
  })

  it('returns a useful offline response if the shell is missing', async () => {
    const runtime = worker(undefined, vi.fn().mockRejectedValue(new Error('offline')))
    const response = await runtime.navigate()
    expect(response?.status).toBe(503)
  })
})


describe('runtime asset caching', () => {
  it('serves the precached release index to programmatic requests while offline', async () => {
    const index = new Response('{"releases":[]}')
    const runtime = worker(index)
    expect(await runtime.releaseIndex()).toBe(index)
    expect(runtime.fetch).not.toHaveBeenCalled()
  })

  it('returns a successful download even if storing it exceeds quota', async () => {
    const response = new Response('image')
    const runtime = worker(undefined, vi.fn().mockResolvedValue(response))
    runtime.cache.put.mockRejectedValue(new Error('quota exceeded'))
    expect(await runtime.asset()).toBe(response)
  })

  it.each([
    new Response('private image', { headers: { 'Cache-Control': 'private, NO-STORE' } }),
    new Response('partial image', { status: 206 }),
  ])('returns an uncacheable download without storing it', async (response) => {
    const runtime = worker(undefined, vi.fn().mockResolvedValue(response))
    expect(await runtime.asset()).toBe(response)
    expect(runtime.cache.put).not.toHaveBeenCalled()
  })

  it('stores a complete cacheable download', async () => {
    const response = new Response('image')
    const runtime = worker(undefined, vi.fn().mockResolvedValue(response))
    expect(await runtime.asset()).toBe(response)
    expect(runtime.cache.put).toHaveBeenCalledOnce()
  })

  it('returns an offline response when the download itself fails', async () => {
    const runtime = worker(undefined, vi.fn().mockRejectedValue(new Error('offline')))
    expect((await runtime.asset())?.status).toBe(504)
  })
})

function pushWorker() {
  const handlers = new Map<string, (event: unknown) => void>()
  const shown: Array<{ title: string; options: Record<string, unknown> }> = []
  const opened: string[] = []
  const messages: unknown[] = []
  const focusedClient = {
    url: 'https://nusgo.test/pwa/stops',
    focus: vi.fn(async () => undefined),
    postMessage: (message: unknown) => messages.push(message),
  }
  runInNewContext(readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8'), {
    __NUSGO_PWA_CACHE_NAME__: 'nusgo-pwa-test',
    __NUSGO_PWA_PRECACHE_URLS__: [],
    self: {
      location: { origin: 'https://nusgo.test' },
      registration: {
        scope: 'https://nusgo.test/pwa/',
        showNotification: async (title: string, options: Record<string, unknown>) => {
          shown.push({ title, options })
        },
      },
      clients: {
        matchAll: async () => [focusedClient],
        openWindow: async (url: string) => { opened.push(url) },
      },
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
    },
    caches: { open: async () => ({ match: async () => undefined, put: async () => undefined }) },
    fetch: vi.fn(),
    URL,
    Response,
    console: { warn: vi.fn() },
  })
  return {
    shown,
    opened,
    messages,
    focusedClient,
    push(payload: unknown) {
      let done: Promise<unknown> | undefined
      handlers.get('push')?.({
        data: payload === undefined ? null : { json: () => payload },
        waitUntil: (value: Promise<unknown>) => { done = value },
      })
      return done
    },
    click(data: unknown) {
      let done: Promise<unknown> | undefined
      handlers.get('notificationclick')?.({
        notification: { close: vi.fn(), data },
        waitUntil: (value: Promise<unknown>) => { done = value },
      })
      return done
    },
  }
}

const validPayload = {
  title: 'Bus D1 delayed',
  body: '7 min late at COM3 Opp',
  url: '?stop=COM3',
  topic: 'service-updates',
  tag: 'delay:COM3:D1',
}

describe('push notifications', () => {
  it('shows a validated push with its tag and deep link', async () => {
    const runtime = pushWorker()
    await runtime.push(validPayload)

    expect(runtime.shown).toHaveLength(1)
    expect(runtime.shown[0]?.title).toBe('Bus D1 delayed')
    expect(runtime.shown[0]?.options).toMatchObject({
      body: '7 min late at COM3 Opp',
      tag: 'delay:COM3:D1',
      data: { url: '?stop=COM3', topic: 'service-updates' },
    })
    expect(runtime.shown[0]?.options.icon).toBe('https://nusgo.test/pwa/icons/pwa-icon-192.png')
  })

  it.each([
    ['no payload', undefined],
    ['missing title', { ...validPayload, title: '' }],
    ['absolute URL', { ...validPayload, url: 'https://evil.test/' }],
    ['javascript URL', { ...validPayload, url: 'javascript:alert(1)' }],
    ['unknown topic', { ...validPayload, topic: 'marketing' }],
    ['over-long body', { ...validPayload, body: 'x'.repeat(161) }],
  ])('shows nothing for %s', async (_label, payload) => {
    const runtime = pushWorker()
    await runtime.push(payload)
    expect(runtime.shown).toHaveLength(0)
  })

  it('focuses an open app window and hands it the deep link', async () => {
    const runtime = pushWorker()
    await runtime.click({ url: '?stop=COM3', topic: 'service-updates' })

    expect(runtime.focusedClient.focus).toHaveBeenCalledOnce()
    expect(runtime.messages).toEqual([{ type: 'PUSH_NOTIFICATION_CLICK', url: '?stop=COM3' }])
    expect(runtime.opened).toEqual([])
  })

  it('opens a new window when no app window exists', async () => {
    const runtime = pushWorker()
    runtime.focusedClient.url = 'https://other.test/pwa/'
    await runtime.click({ url: '?stop=COM3' })
    expect(runtime.opened).toEqual(['https://nusgo.test/pwa/?stop=COM3'])
  })

  it('routes a service-notice click to the Stops view', async () => {
    const runtime = pushWorker()
    await runtime.click({ url: '?view=stops', topic: 'service-updates' })

    expect(runtime.focusedClient.focus).toHaveBeenCalledOnce()
    expect(runtime.messages).toEqual([{ type: 'PUSH_NOTIFICATION_CLICK', url: '?view=stops' }])

    const cold = pushWorker()
    cold.focusedClient.url = 'https://other.test/pwa/'
    await cold.click({ url: '?view=stops' })
    expect(cold.opened).toEqual(['https://nusgo.test/pwa/?view=stops'])
  })

  it('ignores a click without a valid app link', async () => {
    const runtime = pushWorker()
    await runtime.click({ url: 'https://evil.test/' })
    expect(runtime.messages).toEqual([])
    expect(runtime.opened).toEqual([])
  })

  it.each([
    ['missing tag', { ...validPayload, tag: '' }],
    ['missing title', { ...validPayload, title: '' }],
    ['over-long title', { ...validPayload, title: 'x'.repeat(81) }],
    ['missing body', { ...validPayload, body: '' }],
    ['over-long tag', { ...validPayload, tag: 'x'.repeat(129) }],
    ['empty URL', { ...validPayload, url: '' }],
    ['URL with whitespace', { ...validPayload, url: '?stop=COM 3' }],
    ['URL with a hash', { ...validPayload, url: '?stop=COM3#x' }],
    ['null topic', { ...validPayload, topic: null }],
    ['array payload', [{ ...validPayload }]],
  ])('drops the same malformed payload the shared validator drops: %s', async (_label, payload) => {
    expect(parsePushNotificationPayload(payload)).toBeNull()
    const runtime = pushWorker()
    await runtime.push(payload)
    expect(runtime.shown).toHaveLength(0)
  })

  it.each([
    ['valid payload', validPayload],
    ['encoded stop id', { ...validPayload, url: '?stop=COM3%20Opp' }],
    ['Stops view deep link', { ...validPayload, url: '?view=stops', tag: 'announcement:414' }],
  ])('accepts the same well-formed payload the shared validator accepts: %s', async (_label, payload) => {
    expect(parsePushNotificationPayload(payload)).toEqual(payload)
    const runtime = pushWorker()
    await runtime.push(payload)
    expect(runtime.shown).toHaveLength(1)
  })
})
