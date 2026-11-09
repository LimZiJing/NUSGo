import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ShuttleArrivalSnapshot } from '@nusgo/shared'
import {
  deliverPushNotifications,
  PUSH_NOTIFICATION_TIMEOUT_MS,
  PUSH_NOTIFICATION_TTL_SECONDS,
  type PushSendNotification,
  type PushSendOptions,
} from './delivery.ts'
import { createNotificationCap } from './notification-cap.ts'
import { createServiceUpdateNotifications } from './notifications.ts'
import { createServiceUpdatePublisher } from './service-update-publisher.ts'
import { createPushSubscriptionStore } from './subscription-store.ts'

/** A tight hourly allowance keeps the cap tests down to a couple of snapshots. */
const NOTIFICATIONS_PER_HOUR_CAP = 2

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

  it('sends the high urgency with bounded TTL and timeout on every send, including several subscriptions', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    subscribe(store, 'b')
    const optionsSeen: PushSendOptions[] = []
    await deliverPushNotifications(
      store,
      async (_subscription, _payload, options) => {
        optionsSeen.push(options)
        return { statusCode: 201 }
      },
      store.list('service-updates'),
      { payloadFor: () => ({ title: 'T', body: 'B', url: '?stop=COM3', topic: 'service-updates', tag: 'tag' }) },
    )

    assert.equal(optionsSeen.length, 2)
    for (const options of optionsSeen) {
      assert.equal(options.TTL, PUSH_NOTIFICATION_TTL_SECONDS)
      assert.equal(options.timeout, PUSH_NOTIFICATION_TIMEOUT_MS)
      assert.equal(options.urgency, 'high')
    }
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
    const { payloads: [payload] } = createServiceUpdateNotifications(
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
    ).payloads, [])
  })

  it('maps each payload back to its own update when an earlier one was skipped', () => {
    const notifications = createServiceUpdateNotifications(
      [
        { kind: 'delay', stopId: 'REMOVED', routeId: 'D1', delaySeconds: 900 },
        { kind: 'delay', stopId: 'COM3', routeId: 'D1', delaySeconds: 240 },
      ],
      { stopName: (stopId) => (stopId === 'COM3' ? 'COM3 Opp' : null) },
    )

    assert.equal(notifications.payloads.length, 1)
    assert.deepEqual(notifications.updateIndexByPayloadIndex, [1])
  })
})

describe('service update publisher', () => {
  it('sends nothing for the first snapshot and one push for a later delay', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    const payloads: string[] = []
    const publisher = createServiceUpdatePublisher({
      store,
      cap: createNotificationCap({ maxPerHour: NOTIFICATIONS_PER_HOUR_CAP }),
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

  it('sends the high urgency with bounded TTL and timeout with every push', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    const sentOptions: PushSendOptions[] = []
    const publisher = createServiceUpdatePublisher({
      store,
      cap: createNotificationCap({ maxPerHour: NOTIFICATIONS_PER_HOUR_CAP }),
      stopName: () => 'COM3 Opp',
      sendNotification: async (_subscription, _payload, options) => {
        sentOptions.push(options)
        return { statusCode: 201 }
      },
      now: () => Date.parse('2026-11-06T10:00:00Z'),
    })

    await publisher.publish(previousSnapshot())
    await publisher.publish(delayedSnapshot())

    assert.deepEqual(sentOptions, [{
      TTL: PUSH_NOTIFICATION_TTL_SECONDS,
      timeout: PUSH_NOTIFICATION_TIMEOUT_MS,
      urgency: 'high',
    }])
    assert.ok(PUSH_NOTIFICATION_TTL_SECONDS > 0 && PUSH_NOTIFICATION_TTL_SECONDS <= 120)
  })

  it('stops sending once a subscription reaches the hourly cap', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    let sends = 0
    let nowMs = Date.parse('2026-11-06T10:00:00Z')
    const publisher = createServiceUpdatePublisher({
      store,
      cap: createNotificationCap({ maxPerHour: NOTIFICATIONS_PER_HOUR_CAP }),
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

  it('uses the cap supplied by composition rather than a private one', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    const sharedCap = createNotificationCap({ maxPerHour: 1 })
    const publisher = createServiceUpdatePublisher({
      store,
      cap: sharedCap,
      stopName: () => 'A stop',
      sendNotification: async () => ({ statusCode: 201 }),
      now: () => Date.parse('2026-11-06T10:00:00Z'),
    })

    assert.equal(publisher.cap, sharedCap)
    // The route-side reset must free the window the publisher is enforcing.
    sharedCap.reserve(endpoint('a'))?.commit()
    assert.equal(sharedCap.hasCapacity(endpoint('a')), false)
    sharedCap.reset(endpoint('a'))
    assert.equal(sharedCap.hasCapacity(endpoint('a')), true)
  })

  it('does not count a transient failure against the hourly cap', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    const cap = createNotificationCap({ maxPerHour: 2 })
    let sends = 0
    const publisher = createServiceUpdatePublisher({
      store,
      cap,
      stopName: () => 'A stop',
      sendNotification: async () => {
        sends += 1
        throw Object.assign(new Error('push service unavailable'), { statusCode: 503 })
      },
      now: () => Date.parse('2026-11-06T10:00:00Z'),
    })

    await publisher.publish(previousSnapshot())
    const result = await publisher.publish(delayedSnapshot())

    assert.equal(sends, 1)
    assert.equal(result.notificationsSent, 0)
    assert.equal(store.size, 1)
  })

  it('reports only real deliveries when some subscriptions are over the cap', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    subscribe(store, 'b')
    const cap = createNotificationCap({ maxPerHour: 2 })
    cap.reserve(endpoint('a'))?.commit()
    cap.reserve(endpoint('a'))?.commit()
    const sent: string[] = []
    const publisher = createServiceUpdatePublisher({
      store,
      cap,
      stopName: () => 'COM3 Opp',
      sendNotification: async (subscription) => {
        sent.push(subscription.endpoint)
        return { statusCode: 201 }
      },
      now: () => Date.parse('2026-11-06T10:00:00Z'),
    })

    await publisher.publish(previousSnapshot())
    const result = await publisher.publish(delayedSnapshot())

    assert.deepEqual(sent, [endpoint('b')])
    assert.equal(result.notificationsSent, 1)
  })

  it('prefers the largest valid update when an unknown stop is filtered out', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    const payloads: string[] = []
    const publisher = createServiceUpdatePublisher({
      store,
      cap: createNotificationCap({ maxPerHour: NOTIFICATIONS_PER_HOUR_CAP }),
      // The larger delay belongs to a stop that no longer exists in canonical data, so it must
      // not win: the largest *valid* update is the one that names a real stop.
      stopName: (stopId) => (stopId === 'COM3' ? 'COM3 Opp' : null),
      sendNotification: async (_subscription, payload) => {
        payloads.push(payload)
        return { statusCode: 201 }
      },
      now: () => Date.parse('2026-11-06T10:00:00Z'),
    })

    await publisher.publish(snapshot('2026-11-06T09:59:30Z', {
      REMOVED: { D1: 120 },
      COM3: { D1: 120 },
    }))
    await publisher.publish(snapshot('2026-11-06T10:00:00Z', {
      REMOVED: { D1: 900 },
      COM3: { D1: 400 },
    }))

    assert.equal(payloads.length, 1)
    assert.equal((JSON.parse(payloads[0] ?? '{}') as { url: string }).url, '?stop=COM3')
  })

  it('removes a subscription the push service reports as expired and reports it', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'gone')
    const publisher = createServiceUpdatePublisher({
      store,
      cap: createNotificationCap({ maxPerHour: NOTIFICATIONS_PER_HOUR_CAP }),
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


describe('overlapping push delivery', () => {
  it('holds the shared cap until an accepted or rejected send settles', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    const cap = createNotificationCap({ maxPerHour: 1 })
    let rejectSend: (error: Error) => void = () => undefined
    let sends = 0
    const send: PushSendNotification = async () => {
      sends += 1
      return new Promise<{ statusCode: number }>((_resolve, reject) => { rejectSend = reject })
    }
    const options = {
      cap,
      payloadFor: () => ({ title: 'T', body: 'B', url: '?stop=COM3', topic: 'service-updates' as const, tag: 'tag' }),
    }
    const first = deliverPushNotifications(store, send, store.list(), options)
    const overlapping = await deliverPushNotifications(store, send, store.list(), options)
    assert.equal(sends, 1)
    assert.equal(overlapping.deliveredCount, 0)
    rejectSend(new Error('temporary outage'))
    assert.equal((await first).failedCount, 1)
    const retry = await deliverPushNotifications(store, async () => ({ statusCode: 201 }), store.list(), options)
    assert.equal(retry.deliveredCount, 1)
    const capped = await deliverPushNotifications(store, send, store.list(), options)
    assert.equal(capped.deliveredCount, 0)
    assert.equal(sends, 1)
  })
})
