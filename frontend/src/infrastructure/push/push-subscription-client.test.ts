import { describe, expect, it, vi } from 'vitest'
import { createPushSubscriptionClient, toPushSubscriptionRegistration } from './push-subscription-client'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('createPushSubscriptionClient', () => {
  it('reads the VAPID public key from the configured API origin', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ publicKey: 'BExampleKey' }))
    const client = createPushSubscriptionClient({ apiOrigin: 'https://api.example.test', fetcher })

    await expect(client.getPublicKey()).resolves.toBe('BExampleKey')
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.example.test/api/push/public-key')
  })

  it('reports push as unavailable when the server has no public key', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ publicKey: null }))
    const client = createPushSubscriptionClient({ fetcher })

    await expect(client.getPublicKey()).resolves.toBeNull()
  })

  it('rejects an unexpected public key response instead of subscribing with it', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ publicKey: 42 }))
    const client = createPushSubscriptionClient({ fetcher })

    await expect(client.getPublicKey()).rejects.toThrow('push public key response was invalid')
  })

  it('posts the registration to the subscriptions endpoint', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 201 }))
    const client = createPushSubscriptionClient({ fetcher })
    const registration = {
      endpoint: 'https://push.example.test/sub/1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      topic: 'service-updates' as const,
    }

    await client.register(registration)

    expect(fetcher).toHaveBeenCalledWith(
      '/api/push/subscriptions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(registration) }),
    )
  })

  it('treats an already-forgotten subscription as removed', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }))
    const client = createPushSubscriptionClient({ fetcher })

    await expect(client.unregister('https://push.example.test/sub/1')).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledWith(
      '/api/push/subscriptions/remove',
      expect.objectContaining({
        body: JSON.stringify({ endpoint: 'https://push.example.test/sub/1' }),
      }),
    )
  })

  it('reports a server failure so the saved preference is not cleared silently', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 500 }))
    const client = createPushSubscriptionClient({ fetcher })

    await expect(client.unregister('https://push.example.test/sub/1'))
      .rejects.toThrow('push unsubscribe request failed: 500')
  })
})

describe('toPushSubscriptionRegistration', () => {
  it('converts a browser subscription with the default topic', () => {
    expect(toPushSubscriptionRegistration({
      endpoint: 'https://push.example.test/sub/1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    })).toEqual({
      endpoint: 'https://push.example.test/sub/1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      topic: 'service-updates',
    })
  })

  it('returns null when the browser omits key material', () => {
    expect(toPushSubscriptionRegistration({
      endpoint: 'https://push.example.test/sub/1',
      keys: { p256dh: 'p256dh-key' },
    })).toBeNull()
    expect(toPushSubscriptionRegistration({})).toBeNull()
  })
})
