import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { loadBackendConfig } from '../../config.ts'
import { createApp } from '../app.ts'
import { createNotificationCap } from '../../push/notification-cap.ts'
import { createPushSubscriptionStore } from '../../push/subscription-store.ts'
import { closeHttpServer, listenHttpServer } from '../../server.ts'

const PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123:def-456',
  keys: { p256dh: 'BCV2Y0YnotzQ', auth: 'k8Z0dP2vG2s' },
  topic: 'service-updates',
}

const servers: Awaited<ReturnType<typeof listenHttpServer>>[] = []

after(async () => {
  await Promise.all(servers.map((server) => closeHttpServer(server)))
})

interface ServerOptions {
  readonly push?: boolean
  readonly subscriptionRateLimitMaxRequests?: number
}

async function withServer(
  run: (
    baseUrl: string,
    store: ReturnType<typeof createPushSubscriptionStore>,
    cap: ReturnType<typeof createNotificationCap>,
  ) => Promise<void>,
  options: ServerOptions = {},
): Promise<void> {
  const config = loadBackendConfig({
    NODE_ENV: 'test',
    API_CORS_ORIGINS: 'http://localhost:5173',
    ...(options.push === false ? {} : {
      VAPID_PUBLIC_KEY: PUBLIC_KEY,
      VAPID_PRIVATE_KEY: 'test-private-key',
      VAPID_SUBJECT: 'mailto:test@example.com',
      ...(options.subscriptionRateLimitMaxRequests !== undefined
        ? { PUSH_SUBSCRIPTION_RATE_LIMIT_MAX_REQUESTS: String(options.subscriptionRateLimitMaxRequests) }
        : {}),
    }),
  })
  const store = createPushSubscriptionStore()
  const cap = createNotificationCap({ maxPerHour: 4 })
  const server = await listenHttpServer(
    createApp(config, null, null, null, { store, cap }),
    '127.0.0.1',
    0,
  )
  servers.push(server)
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not expose its port')
  try {
    await run('http://127.0.0.1:' + address.port, store, cap)
  } finally {
    await closeHttpServer(server)
  }
}

function post(baseUrl: string, path: string, body: unknown): Promise<Response> {
  return fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('push public key route', () => {
  it('returns the configured VAPID public key', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(baseUrl + '/api/push/public-key')
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { publicKey: PUBLIC_KEY })
    })
  })

  it('reports null when the deployment has no push keys', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(baseUrl + '/api/push/public-key')
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { publicKey: null })
    }, { push: false })
  })

  it('answers unsupported methods with 405', async () => {
    await withServer(async (baseUrl) => {
      const response = await post(baseUrl, '/api/push/public-key', {})
      assert.equal(response.status, 405)
      assert.equal(response.headers.get('allow'), 'GET, HEAD, OPTIONS')
    })
  })
})

describe('push subscription routes', () => {
  it('stores a valid subscription and echoes the chosen topic', async () => {
    await withServer(async (baseUrl, store) => {
      const response = await post(baseUrl, '/api/push/subscriptions', subscription)
      assert.equal(response.status, 201)
      assert.deepEqual(await response.json(), { topic: 'service-updates' })
      assert.deepEqual(store.get(subscription.endpoint), subscription)
    })
  })

  it('rejects endpoints that are not a supported push service on the default HTTPS port', async () => {
    await withServer(async (baseUrl, store) => {
      for (const endpoint of [
        'http://push.example.com/send/a',
        'https://user:pass@fcm.googleapis.com/send/a',
        'https://push.example.com/send/a\nx',
        'https://fcm.googleapis.com:8443/fcm/send/a',
        'https://fcm.googleapis.com.attacker.test/fcm/send/a',
        'https://localhost/fcm/send/a',
        'https://127.0.0.1:8002/x',
        'https://10.0.0.5/fcm/send/a',
      ]) {
        const response = await post(baseUrl, '/api/push/subscriptions', { ...subscription, endpoint })
        assert.equal(response.status, 400, endpoint)
        assert.equal(((await response.json()) as { code?: string }).code, 'invalid_request')
      }
      assert.equal(store.size, 0)
    })
  })

  it('accepts each supported push service host', async () => {
    await withServer(async (baseUrl, store) => {
      for (const endpoint of [
        'https://fcm.googleapis.com/fcm/send/a',
        'https://updates.push.services.mozilla.com/wpush/v2/a',
        'https://web.push.apple.com/QGa',
      ]) {
        const response = await post(baseUrl, '/api/push/subscriptions', { ...subscription, endpoint })
        assert.equal(response.status, 201, endpoint)
      }
      assert.equal(store.size, 3)
    })
  })

  it('rejects a missing key, a non-base64url key, and an unknown topic', async () => {
    await withServer(async (baseUrl, store) => {
      const bodies = [
        { ...subscription, keys: { p256dh: subscription.keys.p256dh } },
        { ...subscription, keys: { ...subscription.keys, auth: 'not base64!' } },
        { ...subscription, topic: 'marketing' },
        { endpoint: subscription.endpoint },
      ]
      for (const body of bodies) {
        const response = await post(baseUrl, '/api/push/subscriptions', body)
        assert.equal(response.status, 400, JSON.stringify(body))
      }
      assert.equal(store.size, 0)
    })
  })

  it('rejects a malformed JSON body', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(baseUrl + '/api/push/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      })
      assert.equal(response.status, 400)
    })
  })

  it('removes a subscription by endpoint and succeeds for an unknown one', async () => {
    await withServer(async (baseUrl, store) => {
      await post(baseUrl, '/api/push/subscriptions', subscription)
      const removed = await post(baseUrl, '/api/push/subscriptions/remove', { endpoint: subscription.endpoint })
      assert.equal(removed.status, 204)
      assert.equal(store.size, 0)

      const unknown = await post(baseUrl, '/api/push/subscriptions/remove', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/never-registered',
      })
      assert.equal(unknown.status, 204)
    })
  })

  it('rejects a removal with an invalid endpoint', async () => {
    await withServer(async (baseUrl) => {
      const response = await post(baseUrl, '/api/push/subscriptions/remove', { endpoint: 'javascript:alert(1)' })
      assert.equal(response.status, 400)
    })
  })

  it('removes an endpoint stored before the registration allowlist existed', async () => {
    await withServer(async (baseUrl, store) => {
      // A record from an earlier deployment whose host the allowlist no longer accepts must still
      // be removable, or the owner could never unsubscribe from it.
      const legacyEndpoint = 'https://push.example.com/send/legacy'
      store.add({ endpoint: legacyEndpoint, keys: subscription.keys, topic: 'service-updates' })

      const response = await post(baseUrl, '/api/push/subscriptions/remove', { endpoint: legacyEndpoint })
      assert.equal(response.status, 204)
      assert.equal(store.size, 0)
    })
  })

  it('rate limits subscription writes per client', async () => {
    await withServer(async (baseUrl, store) => {
      const responses: number[] = []
      for (let index = 0; index < 3; index += 1) {
        responses.push((await post(baseUrl, '/api/push/subscriptions', {
          ...subscription,
          endpoint: subscription.endpoint + '-' + index,
        })).status)
      }
      assert.deepEqual(responses, [201, 201, 429])
      assert.equal(store.size, 2)
    }, { subscriptionRateLimitMaxRequests: 2 })
  })

  it('reports push as unavailable when no VAPID keys are configured', async () => {
    await withServer(async (baseUrl) => {
      const response = await post(baseUrl, '/api/push/subscriptions', subscription)
      assert.equal(response.status, 503)
      assert.equal(((await response.json()) as { code?: string }).code, 'not_ready')
    }, { push: false })
  })

  it('resets the delivered-notification cap when the same endpoint re-registers', async () => {
    await withServer(async (baseUrl, _store, cap) => {
      const maxPerHour = 4
      for (let index = 0; index < maxPerHour; index += 1) {
        assert.equal(cap.hasCapacity(subscription.endpoint), true)
        cap.reserve(subscription.endpoint)?.commit()
      }
      assert.equal(cap.hasCapacity(subscription.endpoint), false)

      const response = await post(baseUrl, '/api/push/subscriptions', subscription)

      assert.equal(response.status, 201)
      assert.equal(cap.hasCapacity(subscription.endpoint), true)
    })
  })

  it('resets the delivered-notification cap when the endpoint unsubscribes', async () => {
    await withServer(async (baseUrl, _store, cap) => {
      for (let index = 0; index < 4; index += 1) cap.reserve(subscription.endpoint)?.commit()
      assert.equal(cap.hasCapacity(subscription.endpoint), false)

      const response = await post(baseUrl, '/api/push/subscriptions/remove', { endpoint: subscription.endpoint })

      assert.equal(response.status, 204)
      assert.equal(cap.hasCapacity(subscription.endpoint), true)
    })
  })
})
