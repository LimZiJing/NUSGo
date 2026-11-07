import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ShuttleArrivalSnapshot } from '@nusgo/shared'
import type { PushConfig } from '../config.ts'
import { deliverPushNotifications, type PushSendNotification } from './delivery.ts'
import { createServiceUpdateNotifications } from './notifications.ts'
import { createServiceUpdatePublisher } from './service-update-publisher.ts'
import { createPushSubscriptionStore } from './subscription-store.ts'

const push: PushConfig = {
  publicKey: 'BPublicKeyValue',
  privateKey: 'PrivateKeyValue',
  subject: 'mailto:test@example.com',
  subscriptionRateLimitMaxRequests: 10,
  notificationsPerHourCap: 2,
}

function endpoint(suffix: string): string {
  return 'https://push.example.com/send/' + suffix
}

function subscribe(store: ReturnType<typeof createPushSubscriptionStore>, suffix: string): void {
  store.add({
    endpoint: endpoint(suffix),
    keys: { p256dh: 'BPublicKeyValue', auth: 'AuthSecretValue' },
    topic: 'service-updates',
  })
}

function expiredSubscriptionError(): Error & { statusCode: number } {
  return Object.assign(new Error('subscription has expired'), { statusCode: 410 })
}

function snapshot(
  observedAt: string,
  arrivals: Readonly<Record<string, Readonly<Record<string, number>>>>,
): ShuttleArrivalSnapshot {
  return {
    observedAt,
    expiresAt: observedAt,
    stops: Object.fromEntries(Object.entries(arrivals).map(([stopId, routes]) => [
      stopId,
      Object.fromEntries(Object.entries(routes).map(([routeId, nextArrivalSeconds]) => [routeId, {
        nextArrivalSeconds,
        upcomingArrivalSeconds: [nextArrivalSeconds],
        headwaySeconds: null,
      }])),
    ])),
    stopObservations: Object.fromEntries(Object.keys(arrivals).map((stopId) => [
      stopId,
      { observedAt, expiresAt: observedAt },
    ])),
  }
}

const delayedSnapshot = (): ShuttleArrivalSnapshot =>
  snapshot('2026-11-06T10:00:00Z', { COM3: { D1: 600 } })
const previousSnapshot = (): ShuttleArrivalSnapshot =>
  snapshot('2026-11-06T09:59:30Z', { COM3: { D1: 120 } })

describe('push delivery', () => {
  it('prunes a subscription the push service reports as gone', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'gone')
    subscribe(store, 'kept')
    const sendNotification: PushSendNotification = async (subscription) => {
      if (subscription.endpoint === endpoint('gone')) throw expiredSubscriptionError()
      return { statusCode: 201 }
    }

    const summary = await deliverPushNotifications(
      store,
      sendNotification,
      store.list('service-updates'),
      { payloadFor: () => ({ title: 'T', body: 'B', url: '?stop=COM3', topic: 'service-updates', tag: 'tag' }) },
    )

    assert.deepEqual(summary.prunedEndpoints, [endpoint('gone')])
    assert.equal(summary.deliveredCount, 1)
    assert.equal(summary.failedCount, 0)
    assert.equal(store.get(endpoint('gone')), null)
    assert.notEqual(store.get(endpoint('kept')), null)
  })

  it('prunes on 404 as well as 410', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'gone')
    const summary = await deliverPushNotifications(
      store,
      async () => { throw Object.assign(new Error('not found'), { statusCode: 404 }) },
      store.list('service-updates'),
      { payloadFor: () => ({ title: 'T', body: 'B', url: '?stop=COM3', topic: 'service-updates', tag: 'tag' }) },
    )

    assert.equal(summary.prunedEndpoints.length, 1)
    assert.equal(store.size, 0)
  })

  it('keeps a subscription when delivery fails for a temporary reason', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'busy')
    const summary = await deliverPushNotifications(
      store,
      async () => { throw Object.assign(new Error('server error'), { statusCode: 500 }) },
      store.list('service-updates'),
      { payloadFor: () => ({ title: 'T', body: 'B', url: '?stop=COM3', topic: 'service-updates', tag: 'tag' }) },
    )

    assert.deepEqual(summary.prunedEndpoints, [])
    assert.equal(summary.failedCount, 1)
    assert.equal(store.size, 1)
  })

  it('skips a subscription when no payload is chosen for it', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    let sends = 0
    const summary = await deliverPushNotifications(
      store,
      async () => { sends += 1; return { statusCode: 201 } },
      store.list('service-updates'),
      { payloadFor: () => null },
    )

    assert.equal(sends, 0)
    assert.equal(summary.deliveredCount, 0)
  })
})

describe('service update notifications', () => {
  it('keeps the title short, the body to one line, and deep links to the stop', () => {
    const [payload] = createServiceUpdateNotifications(
      [{ kind: 'delay', stopId: 'COM3', routeId: 'D1', delaySeconds: 420 }],
      { stopName: () => 'COM3 Opp' },
    )

    assert.equal(payload?.title, 'Bus D1 delayed')
    assert.equal(payload?.body, '7 min late at COM3 Opp')
    assert.equal(payload?.url, '?stop=COM3')
    assert.equal(payload?.tag, 'delay:COM3:D1')
  })

  it('skips an update for a stop that is no longer canonical', () => {
    assert.deepEqual(createServiceUpdateNotifications(
      [{ kind: 'delay', stopId: 'REMOVED', routeId: 'D1', delaySeconds: 420 }],
      { stopName: () => null },
    ), [])
  })
})

describe('service update publisher', () => {
  it('sends nothing for the first snapshot and one push for a later delay', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    const payloads: string[] = []
    const publisher = createServiceUpdatePublisher({
      store,
      push,
      stopName: () => 'COM3 Opp',
      sendNotification: async (_subscription, payload) => {
        payloads.push(payload)
        return { statusCode: 201 }
      },
      now: () => Date.parse('2026-11-06T10:00:00Z'),
    })

    assert.equal((await publisher.publish(previousSnapshot())).notificationsSent, 0)
    const result = await publisher.publish(delayedSnapshot())

    assert.equal(result.notificationsSent, 1)
    assert.equal(payloads.length, 1)
    const payload = JSON.parse(payloads[0] ?? '{}') as { title: string; url: string }
    assert.equal(payload.title, 'Bus D1 delayed')
    assert.equal(payload.url, '?stop=COM3')
  })

  it('stops sending once a subscription reaches the hourly cap', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    let sends = 0
    let nowMs = Date.parse('2026-11-06T10:00:00Z')
    const publisher = createServiceUpdatePublisher({
      store,
      push,
      stopName: () => 'A stop',
      sendNotification: async () => { sends += 1; return { statusCode: 201 } },
      now: () => nowMs,
    })

    // Three separate delays at different stops, so the per-stop repeat window never applies and
    // only the hourly cap of two can suppress the third.
    const stopIds = ['COM3', 'CLB', 'UTOWN']
    for (const [index, stopId] of stopIds.entries()) {
      const before = nowMs
      nowMs += 30_000
      await publisher.publish(snapshot(new Date(before).toISOString(), { [stopId]: { D1: 120 } }))
      await publisher.publish(snapshot(new Date(nowMs).toISOString(), { [stopId]: { D1: 600 } }))
      if (index === 0) assert.equal(sends, 1)
    }

    assert.equal(sends, 2)
    assert.equal(store.size, 1)
  })

  it('removes a subscription the push service reports as expired and reports it', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'gone')
    const publisher = createServiceUpdatePublisher({
      store,
      push,
      stopName: () => 'COM3 Opp',
      sendNotification: async () => { throw expiredSubscriptionError() },
      now: () => Date.parse('2026-11-06T10:00:00Z'),
    })

    await publisher.publish(previousSnapshot())
    const result = await publisher.publish(delayedSnapshot())

    assert.deepEqual(result.prunedEndpoints, [endpoint('gone')])
    assert.equal(store.size, 0)
  })
})
