import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { generateShuttleTimingData, validateTransitMapData, type PushReminderResponse } from '@nusgo/shared'
import { loadBackendConfig } from '../../config.ts'
import { validateCanonicalData, type BackendData } from '../../canonical-data.ts'
import { DEFAULT_ALIGHT_REMINDER_TTL_MS, createAlightReminderRegistry, type AlightReminderRegistry } from '../../push/reminder-registry.ts'
import { createNotificationCap } from '../../push/notification-cap.ts'
import { createPushSubscriptionStore } from '../../push/subscription-store.ts'
import { createApp } from '../app.ts'
import { closeHttpServer, listenHttpServer } from '../../server.ts'

const PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const sourceDataDirectory = resolve(repositoryRoot, 'frontend/public/data')
const registeredAtMs = Date.parse('2026-11-06T10:00:00Z')
let backendData: BackendData

const registration = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/reminder-1',
  keys: { p256dh: 'BCV2Y0YnotzQ', auth: 'k8Z0dP2vG2s' },
  topic: 'alight-reminders',
  watch: { stopId: 'COM3', routeId: 'D1' },
  leadTimeSeconds: 120,
}

const servers: Awaited<ReturnType<typeof listenHttpServer>>[] = []

before(async () => {
  async function readJson(filename: string): Promise<unknown> {
    return JSON.parse(await readFile(resolve(sourceDataDirectory, filename), 'utf8')) as unknown
  }
  const [venues, buildings, network, routeGeometry, walkingStopGraph] = await Promise.all([
    readJson('venues.json'),
    readJson('buildings.json'),
    readJson('shuttle-network.json'),
    readJson('shuttle-routes.geojson'),
    readJson('walking-stop-graph.json'),
  ])
  const transit = validateTransitMapData(network, routeGeometry)
  backendData = validateCanonicalData({
    venues,
    buildings,
    network,
    routeGeometry,
    walkingStopGraph,
    shuttleTiming: generateShuttleTimingData(
      transit.network,
      transit.geometry,
      transit.network.metadata.verifiedAt,
    ),
  }, 'development')
})

after(async () => {
  await Promise.all(servers.map((server) => closeHttpServer(server)))
})

interface ServerOptions {
  readonly push?: boolean
  readonly subscriptionRateLimitMaxRequests?: number
  /** Server clock for the registry, so expiry assertions are exact rather than timing-dependent. */
  readonly now?: () => number
}

async function withServer(
  run: (baseUrl: string, registry: AlightReminderRegistry) => Promise<void>,
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
  const registry = createAlightReminderRegistry({ now: options.now ?? (() => registeredAtMs) })
  const server = await listenHttpServer(
    createApp(config, backendData, null, null, { store, cap, reminderRegistry: registry }),
    '127.0.0.1',
    0,
  )
  servers.push(server)
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not expose its port')
  try {
    await run('http://127.0.0.1:' + address.port, registry)
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

describe('alight reminder routes', () => {
  it('stores a reminder and echoes the topic, lead time and server expiry', async () => {
    await withServer(async (baseUrl, registry) => {
      const response = await post(baseUrl, '/api/push/reminders', registration)

      assert.equal(response.status, 201)
      const body = await response.json() as PushReminderResponse
      assert.equal(body.topic, 'alight-reminders')
      assert.equal(body.leadTimeSeconds, 120)
      // The client cannot choose its own expiry; the server assigns it from its own clock.
      assert.equal(body.expiresAt, new Date(registeredAtMs + DEFAULT_ALIGHT_REMINDER_TTL_MS).toISOString())
      assert.deepEqual(registry.get(registration.endpoint)?.watch, registration.watch)
      assert.equal(registry.get(registration.endpoint)?.leadTimeSeconds, 120)
    })
  })

  it('stores the lead time the rider chose and defaults when it is omitted', async () => {
    await withServer(async (baseUrl, registry) => {
      const chosen = await post(baseUrl, '/api/push/reminders', {
        ...registration,
        leadTimeSeconds: 180,
      })
      assert.equal(chosen.status, 201)
      assert.equal(((await chosen.json()) as PushReminderResponse).leadTimeSeconds, 180)
      assert.equal(registry.get(registration.endpoint)?.leadTimeSeconds, 180)

      // Omitting the field is the documented default rather than a rejection.
      const withoutLeadTime = {
        endpoint: registration.endpoint + '-default',
        keys: registration.keys,
        topic: registration.topic,
        watch: registration.watch,
      }
      const defaulted = await post(baseUrl, '/api/push/reminders', withoutLeadTime)
      assert.equal(defaulted.status, 201)
      assert.equal(((await defaulted.json()) as PushReminderResponse).leadTimeSeconds, 120)
    })
  })

  it('rejects a lead time outside the offered set instead of rounding it', async () => {
    await withServer(async (baseUrl, registry) => {
      for (const leadTimeSeconds of [0, -120, 90, 3600, '120', null]) {
        const response = await post(baseUrl, '/api/push/reminders', { ...registration, leadTimeSeconds })
        assert.equal(response.status, 400, JSON.stringify(leadTimeSeconds))
        assert.equal(((await response.json()) as { code?: string }).code, 'invalid_request')
      }
      assert.equal(registry.size, 0)
    })
  })

  it('ignores a client-supplied expiry and keeps the server-assigned one', async () => {
    await withServer(async (baseUrl, registry) => {
      const response = await post(baseUrl, '/api/push/reminders', {
        ...registration,
        expiresAt: '2099-01-01T00:00:00Z',
        createdAtMs: 0,
      })

      assert.equal(response.status, 201)
      const stored = registry.get(registration.endpoint)
      assert.equal(stored?.expiresAtMs, registeredAtMs + DEFAULT_ALIGHT_REMINDER_TTL_MS)
      assert.equal(stored?.createdAtMs, registeredAtMs)
    })
  })

  it('rejects an unknown stop or route, which could never be matched', async () => {
    await withServer(async (baseUrl, registry) => {
      for (const watch of [
        { stopId: 'NOT-A-STOP', routeId: 'D1' },
        { stopId: 'COM3', routeId: 'ZZ' },
      ]) {
        const response = await post(baseUrl, '/api/push/reminders', { ...registration, watch })
        assert.equal(response.status, 400, JSON.stringify(watch))
        assert.equal(((await response.json()) as { code?: string }).code, 'invalid_request')
      }
      assert.equal(registry.size, 0)
    })
  })

  it('rejects a malformed watch, a bad key and a body with no reminder content', async () => {
    await withServer(async (baseUrl, registry) => {
      const bodies = [
        { ...registration, watch: { stopId: 'COM3' } },
        { ...registration, watch: { stopId: 'COM3', routeId: 'D 1' } },
        { ...registration, keys: { ...registration.keys, auth: 'not base64!' } },
        { ...registration, watch: undefined },
      ]
      for (const body of bodies) {
        const response = await post(baseUrl, '/api/push/reminders', body)
        assert.equal(response.status, 400, JSON.stringify(body))
      }
      assert.equal(registry.size, 0)
    })
  })

  it('removes a reminder by endpoint and succeeds for an unknown one', async () => {
    await withServer(async (baseUrl, registry) => {
      await post(baseUrl, '/api/push/reminders', registration)
      const removed = await post(baseUrl, '/api/push/reminders/remove', { endpoint: registration.endpoint })
      assert.equal(removed.status, 204)
      assert.equal(registry.size, 0)

      const unknown = await post(baseUrl, '/api/push/reminders/remove', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/never-registered',
      })
      assert.equal(unknown.status, 204)
    })
  })

  it('rejects a removal with an invalid endpoint', async () => {
    await withServer(async (baseUrl) => {
      const response = await post(baseUrl, '/api/push/reminders/remove', { endpoint: 'javascript:alert(1)' })
      assert.equal(response.status, 400)
    })
  })

  it('reports an expired registration as gone, so it can never be read back', async () => {
    let nowMs = registeredAtMs
    await withServer(async (baseUrl, registry) => {
      await post(baseUrl, '/api/push/reminders', registration)
      assert.notEqual(registry.get(registration.endpoint), null)

      // One millisecond before expiry the watch is still live; at the boundary it is removed.
      nowMs = registeredAtMs + DEFAULT_ALIGHT_REMINDER_TTL_MS - 1
      assert.notEqual(registry.get(registration.endpoint), null)
      nowMs = registeredAtMs + DEFAULT_ALIGHT_REMINDER_TTL_MS
      assert.equal(registry.get(registration.endpoint), null)
      assert.equal(registry.size, 0)
    }, { now: () => nowMs })
  })

  it('rate limits reminder writes with the push routes per-client budget', async () => {
    await withServer(async (baseUrl, registry) => {
      const responses: number[] = []
      for (let index = 0; index < 3; index += 1) {
        responses.push((await post(baseUrl, '/api/push/reminders', {
          ...registration,
          endpoint: registration.endpoint + '-' + index,
        })).status)
      }
      assert.deepEqual(responses, [201, 201, 429])
      assert.equal(registry.size, 2)
    }, { subscriptionRateLimitMaxRequests: 2 })
  })

  it('reports push as unavailable when no VAPID keys are configured', async () => {
    await withServer(async (baseUrl) => {
      const response = await post(baseUrl, '/api/push/reminders', registration)
      assert.equal(response.status, 503)
      assert.equal(((await response.json()) as { code?: string }).code, 'not_ready')
    }, { push: false })
  })

  it('keeps the service-updates and reminder topics independent for one endpoint', async () => {
    await withServer(async (baseUrl, registry) => {
      // Registering a reminder must not overwrite the rider's service-update subscription, and
      // registering service updates afterwards must not drop the reminder.
      await post(baseUrl, '/api/push/subscriptions', {
        endpoint: registration.endpoint,
        keys: registration.keys,
        topic: 'service-updates',
      })
      await post(baseUrl, '/api/push/reminders', registration)

      assert.deepEqual(registry.get(registration.endpoint)?.watch, registration.watch)
    })
  })
})
