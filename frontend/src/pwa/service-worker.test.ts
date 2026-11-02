import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

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
  return { navigate, asset, fetch, cache }
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
