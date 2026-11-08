import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ShuttleArrivalSnapshot } from '@nusgo/shared'
import type { PushConfig } from '../config.ts'
import {
  createAlightReminderPublisher,
  evaluateAlightReminders,
  type ReminderSkipReason,
} from './alight-reminders.ts'
import type { PushSendNotification } from './delivery.ts'
import {
  DEFAULT_ALIGHT_REMINDER_TTL_MS,
  createAlightReminderRegistry,
  type AlightReminderRecord,
  type AlightReminderRegistration,
} from './reminder-registry.ts'

const push: PushConfig = {
  publicKey: 'BPublicKeyValue',
  privateKey: 'PrivateKeyValue',
  subject: 'mailto:test@example.com',
  subscriptionRateLimitMaxRequests: 10,
  notificationsPerHourCap: 4,
}

const observedAt = '2026-11-06T10:00:00Z'
const nowMs = Date.parse(observedAt)

function endpoint(suffix: string): string {
  return 'https://push.example.com/send/' + suffix
}

function registration(suffix: string, stopId = 'COM3', routeId = 'D1', leadTimeSeconds: 120 | 60 | 180 = 120): AlightReminderRegistration {
  return {
    endpoint: endpoint(suffix),
    keys: { p256dh: 'BPublicKeyValue', auth: 'AuthSecretValue' },
    topic: 'alight-reminders',
    watch: { stopId, routeId },
    leadTimeSeconds,
  }
}

/** A record as the registry would report it: fresh, with a server expiry two hours out. */
function reminder(suffix: string, stopId = 'COM3', routeId = 'D1', leadTimeSeconds: 120 | 60 | 180 = 120): AlightReminderRecord {
  return {
    ...registration(suffix, stopId, routeId, leadTimeSeconds),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + DEFAULT_ALIGHT_REMINDER_TTL_MS,
    generation: 1,
  }
}

interface SnapshotOptions {
  readonly observedAt?: string
  readonly expiresAt?: string
  readonly seconds?: number
  readonly unavailableStopIds?: readonly string[]
  readonly observationExpiresAt?: string
  readonly stopObservation?: boolean
  readonly routes?: Readonly<Record<string, number>>
}

function snapshot(options: SnapshotOptions = {}): ShuttleArrivalSnapshot {
  const observed = options.observedAt ?? observedAt
  const expiresAt = options.expiresAt ?? observed
  const routes = options.routes ?? { D1: options.seconds ?? 90 }
  return {
    observedAt: observed,
    expiresAt,
    stops: { COM3: Object.fromEntries(Object.entries(routes).map(([routeId, nextArrivalSeconds]) => [
      routeId,
      { nextArrivalSeconds, upcomingArrivalSeconds: [nextArrivalSeconds], headwaySeconds: null },
    ])) },
    stopObservations: options.stopObservation === false
      ? {}
      : { COM3: { observedAt: observed, expiresAt: options.observationExpiresAt ?? expiresAt } },
    unavailableStopIds: options.unavailableStopIds ?? [],
  }
}

function evaluate(
  records: readonly AlightReminderRecord[],
  arrivals: ShuttleArrivalSnapshot,
  extra: {
    now?: number
    serviceStatus?: (routeId: string) => 'active' | 'before-start' | 'after-end' | 'unavailable' | 'unknown'
  } = {},
) {
  return evaluateAlightReminders(records, arrivals, {
    now: () => extra.now ?? nowMs,
    ...(extra.serviceStatus ? { serviceStatus: (routeId) => extra.serviceStatus!(routeId) } : {}),
  })
}

function skipReason(
  result: ReturnType<typeof evaluate>,
  suffix: string,
): ReminderSkipReason | undefined {
  return result.skipped.find(({ record }) => record.endpoint === endpoint(suffix))?.reason
}

describe('alight reminder evaluation', () => {
  it('fires when the next bus is inside the lead time the rider chose', () => {
    const result = evaluate([reminder('a', 'COM3', 'D1', 180)], snapshot({ seconds: 175 }))

    assert.equal(result.skipped.length, 0)
    assert.deepEqual(result.due.map(({ stopId, routeId, minutesUntilArrival }) => ({
      stopId,
      routeId,
      minutes: minutesUntilArrival,
    })), [{ stopId: 'COM3', routeId: 'D1', minutes: 175 / 60 }])
  })

  it('uses the rider lead time rather than one fixed threshold', () => {
    // The same arrival is due for a three-minute lead time but not for a one-minute one.
    const longLead = evaluate([reminder('long', 'COM3', 'D1', 180)], snapshot({ seconds: 150 }))
    const shortLead = evaluate([reminder('short', 'COM3', 'D1', 60)], snapshot({ seconds: 150 }))

    assert.equal(longLead.due.length, 1)
    assert.deepEqual(shortLead.due, [])
    assert.equal(skipReason(shortLead, 'short'), 'not-yet-close')
  })

  it('does not fire while the next bus is still further away than the lead time', () => {
    const result = evaluate([reminder('a')], snapshot({ seconds: 600 }))

    assert.deepEqual(result.due, [])
    assert.equal(skipReason(result, 'a'), 'not-yet-close')
  })

  it('fires at the exact lead-time boundary', () => {
    assert.equal(evaluate([reminder('a')], snapshot({ seconds: 120 })).due.length, 1)
    assert.equal(evaluate([reminder('a')], snapshot({ seconds: 121 })).due.length, 0)
  })

  it('does not fire from an expired watch, even from a fresh snapshot', () => {
    const expired = { ...reminder('a'), expiresAtMs: nowMs }
    const result = evaluate([expired], snapshot({ seconds: 30 }))

    assert.deepEqual(result.due, [])
    assert.equal(skipReason(result, 'a'), 'expired')
  })

  it('keeps a watch live one millisecond before its expiry', () => {
    const record = { ...reminder('a'), expiresAtMs: nowMs + 1 }
    assert.equal(evaluate([record], snapshot({ seconds: 30 })).due.length, 1)
  })

  // Each "must not fire" case from the issue is asserted on its own reason, so a future change
  // that suppresses reminders for the wrong cause still fails a test.
  it('does not fire from an expired snapshot', () => {
    const result = evaluate([reminder('a')], snapshot({ expiresAt: '2026-11-06T09:59:00Z', seconds: 30 }))
    assert.deepEqual(result.due, [])
    assert.equal(skipReason(result, 'a'), 'stale-snapshot')
  })

  it('does not fire from a snapshot older than the freshness constant', () => {
    const result = evaluate([reminder('a')], snapshot({ seconds: 30 }), { now: nowMs + 45_000 })
    assert.deepEqual(result.due, [])
    assert.equal(skipReason(result, 'a'), 'stale-snapshot')
  })

  it('does not fire when the stop is unavailable because the provider dropped it this refresh', () => {
    const result = evaluate([reminder('a')], snapshot({ seconds: 30, unavailableStopIds: ['COM3'] }))
    assert.deepEqual(result.due, [])
    assert.equal(skipReason(result, 'a'), 'unavailable-stop')
  })

  it('does not fire when the stop was not observed at all', () => {
    const result = evaluate([reminder('a')], snapshot({ seconds: 30, stopObservation: false }))
    assert.deepEqual(result.due, [])
    assert.equal(skipReason(result, 'a'), 'unobserved-stop')
  })

  it('does not fire when the stop observation itself is stale inside a fresh snapshot', () => {
    const result = evaluate(
      [reminder('a')],
      snapshot({ seconds: 30, observationExpiresAt: '2026-11-06T09:59:00Z' }),
    )
    assert.deepEqual(result.due, [])
    assert.equal(skipReason(result, 'a'), 'stale-snapshot')
  })

  it('does not fire when the watched route has no arrival data at that stop', () => {
    const result = evaluate([reminder('a')], snapshot({ routes: { A1: 60 } }))
    assert.deepEqual(result.due, [])
    assert.equal(skipReason(result, 'a'), 'no-arrival')
  })

  it('does not fire when the shuttle service is not running', () => {
    for (const status of ['before-start', 'after-end', 'unavailable'] as const) {
      const result = evaluate([reminder('a')], snapshot({ seconds: 30 }), {
        serviceStatus: () => status,
      })
      assert.deepEqual(result.due, [], status)
      assert.equal(skipReason(result, 'a'), 'not-running', status)
    }
  })

  it('trusts the snapshot when no cached service hours exist for the route', () => {
    const result = evaluate([reminder('a')], snapshot({ seconds: 30 }), { serviceStatus: () => 'unknown' })
    assert.equal(result.due.length, 1)
  })

  it('skips a watch whose delivery is still in flight', () => {
    const result = evaluateAlightReminders([reminder('a')], snapshot({ seconds: 30 }), {
      now: () => nowMs,
      inFlight: () => true,
    })
    assert.deepEqual(result.due, [])
    assert.equal(skipReason(result, 'a'), 'delivery-in-flight')
  })

  it('evaluates each watch independently', () => {
    const records = [reminder('close', 'COM3', 'D1'), reminder('far', 'COM3', 'A1')]
    const result = evaluate(records, snapshot({ routes: { D1: 30, A1: 900 } }))

    assert.deepEqual(result.due.map(({ record }) => record.endpoint), [endpoint('close')])
    assert.equal(skipReason(result, 'far'), 'not-yet-close')
  })
})

describe('alight reminder publisher', () => {
  interface SetupOptions {
    readonly sendNotification?: PushSendNotification
    readonly notificationsPerHourCap?: number
    readonly now?: () => number
  }

  function setup(options: SetupOptions = {}) {
    const registry = createAlightReminderRegistry({
      now: options.now ?? (() => nowMs),
    })
    registry.upsert(registration('a'))
    const payloads: string[] = []
    const sendNotification: PushSendNotification = options.sendNotification ?? (async (_subscription, payload) => {
      payloads.push(payload)
      return { statusCode: 201 }
    })
    const publisher = createAlightReminderPublisher({
      registry,
      push: { ...push, notificationsPerHourCap: options.notificationsPerHourCap ?? push.notificationsPerHourCap },
      stopName: (stopId) => (stopId === 'COM3' ? 'COM3 Opp' : null),
      sendNotification,
      now: options.now ?? (() => nowMs),
    })
    return { registry, payloads, publisher }
  }

  it('pushes one reminder payload with the stop deep link and reminder topic', async () => {
    const { payloads, publisher } = setup()

    const result = await publisher.publish(snapshot({ seconds: 90 }))

    assert.equal(result.notificationsSent, 1)
    assert.equal(payloads.length, 1)
    const payload = JSON.parse(payloads[0] ?? '{}') as {
      title: string
      body: string
      url: string
      topic: string
      tag: string
    }
    assert.equal(payload.title, 'Bus D1 is arriving')
    assert.equal(payload.body, 'About 2 min to COM3 Opp')
    assert.equal(payload.url, '?stop=COM3')
    assert.equal(payload.topic, 'alight-reminders')
    assert.equal(payload.tag, 'reminder:COM3:D1')
  })

  it('removes the watch after the confirmed send, so a later bus cannot push again', async () => {
    const { registry, payloads, publisher } = setup()

    assert.equal((await publisher.publish(snapshot({ seconds: 90 }))).notificationsSent, 1)
    assert.equal(registry.get(endpoint('a')), null)

    // A later bus at the same stop, and the rider's re-armed state, must not produce a second push.
    assert.equal((await publisher.publish(snapshot({ seconds: 600 }))).notificationsSent, 0)
    assert.equal((await publisher.publish(snapshot({ seconds: 90 }))).notificationsSent, 0)
    assert.equal(payloads.length, 1)
  })

  it('keeps the watch eligible when a send fails for a transient reason', async () => {
    let failNext = true
    const streamed: string[] = []
    const { registry, publisher } = setup({
      sendNotification: async (_subscription, payload) => {
        if (failNext) {
          failNext = false
          throw Object.assign(new Error('server error'), { statusCode: 503 })
        }
        streamed.push(payload)
        return { statusCode: 201 }
      },
    })

    const failed = await publisher.publish(snapshot({ seconds: 90 }))
    assert.equal(failed.notificationsSent, 0)
    // Neither the watch nor the announced state was consumed by the failure.
    assert.notEqual(registry.get(endpoint('a')), null)
    assert.equal(publisher.cap.trackedCount, 0)

    const retried = await publisher.publish(snapshot({ seconds: 80 }))
    assert.equal(retried.notificationsSent, 1)
    assert.equal(streamed.length, 1)
    assert.equal(registry.get(endpoint('a')), null)
  })

  it('does not spend the hourly cap or remove the watch when the cap refuses the send', async () => {
    const { registry, payloads, publisher } = setup({ notificationsPerHourCap: 0 })

    const result = await publisher.publish(snapshot({ seconds: 60 }))

    assert.equal(result.notificationsSent, 0)
    assert.equal(payloads.length, 0)
    assert.notEqual(registry.get(endpoint('a')), null)
  })

  it('prevents a duplicate send while the first delivery is still in flight', async () => {
    let release: (() => void) | undefined
    const payloads: string[] = []
    const { registry, publisher } = setup({
      sendNotification: async (_subscription, payload) => {
        payloads.push(payload)
        await new Promise<void>((resolve) => { release = resolve })
        return { statusCode: 201 }
      },
    })

    const first = publisher.publish(snapshot({ seconds: 90 }))
    // A second snapshot arrives before the push service answered the first send.
    const second = await publisher.publish(snapshot({ seconds: 80 }))
    assert.equal(second.notificationsSent, 0)
    assert.equal(second.skipped[0]?.reason, 'delivery-in-flight')
    assert.equal(payloads.length, 1)

    release?.()
    assert.equal((await first).notificationsSent, 1)
    assert.equal(registry.get(endpoint('a')), null)
  })

  it('removes an endpoint the push service reports as gone', async () => {
    const { registry, publisher } = setup({
      sendNotification: async () => { throw Object.assign(new Error('expired'), { statusCode: 410 }) },
    })

    const result = await publisher.publish(snapshot({ seconds: 60 }))

    assert.deepEqual(result.prunedEndpoints, [endpoint('a')])
    assert.equal(registry.size, 0)
  })

  it('prunes a 404 as well as a 410', async () => {
    const { registry, publisher } = setup({
      sendNotification: async () => { throw Object.assign(new Error('not found'), { statusCode: 404 }) },
    })

    const result = await publisher.publish(snapshot({ seconds: 60 }))

    assert.deepEqual(result.prunedEndpoints, [endpoint('a')])
    assert.equal(registry.size, 0)
  })

  it('keeps a watch re-registered during an in-flight send', async () => {
    let release: (() => void) | undefined
    const { registry, publisher } = setup({
      sendNotification: async () => {
        await new Promise<void>((resolve) => { release = resolve })
        return { statusCode: 201 }
      },
    })

    const inFlight = publisher.publish(snapshot({ seconds: 90 }))
    // The rider removes this stop's reminder and asks for another one while the send is in flight.
    registry.upsert(registration('a', 'CLB', 'A1', 60))

    release?.()
    await inFlight

    const stored = registry.get(endpoint('a'))
    assert.notEqual(stored, null)
    assert.deepEqual(stored?.watch, { stopId: 'CLB', routeId: 'A1' })
  })

  it('keeps a re-registered watch when the in-flight send is pruned as gone', async () => {
    let release: (() => void) | undefined
    const { registry, publisher } = setup({
      sendNotification: async () => {
        await new Promise<void>((resolve) => { release = resolve })
        throw Object.assign(new Error('expired'), { statusCode: 410 })
      },
    })

    const inFlight = publisher.publish(snapshot({ seconds: 90 }))
    registry.upsert(registration('a', 'CLB', 'A1', 60))

    release?.()
    await inFlight

    assert.deepEqual(registry.get(endpoint('a'))?.watch, { stopId: 'CLB', routeId: 'A1' })
  })

  it('sends nothing from a stale snapshot and still fires once the data is fresh', async () => {
    const { payloads, publisher } = setup()

    assert.equal((await publisher.publish(snapshot({ expiresAt: '2026-11-06T09:59:00Z' }))).notificationsSent, 0)
    assert.equal((await publisher.publish(snapshot({ seconds: 600 }))).notificationsSent, 0)
    assert.equal((await publisher.publish(snapshot({ seconds: 90 }))).notificationsSent, 1)
    assert.equal(payloads.length, 1)
  })

  it('never pushes an expired watch, and removes it', async () => {
    let nowValue = nowMs
    const { registry, payloads, publisher } = setup({ now: () => nowValue })
    const created = registry.get(endpoint('a'))
    assert.ok(created)

    nowValue = created.expiresAtMs
    // Fresh data exists, but the watch expired exactly at this instant.
    const result = await publisher.publish(snapshot({ observedAt: new Date(nowValue).toISOString(), seconds: 30 }))

    assert.equal(result.notificationsSent, 0)
    assert.deepEqual(result.expiredEndpoints, [endpoint('a')])
    assert.equal(payloads.length, 0)
    assert.equal(registry.size, 0)
  })

  it('does not push an expired watch even when no snapshot mentions it', async () => {
    let nowValue = nowMs
    const { registry, publisher } = setup({ now: () => nowValue })
    const created = registry.get(endpoint('a'))
    assert.ok(created)

    nowValue = created.expiresAtMs + 1
    const result = await publisher.publish(snapshot({ observedAt: new Date(nowValue).toISOString(), seconds: 30 }))

    assert.equal(result.notificationsSent, 0)
    assert.deepEqual(result.expiredEndpoints, [endpoint('a')])
    assert.equal(registry.size, 0)
  })

  it('retries a watch that is still inside its lead time on the next snapshot', async () => {
    const { payloads, publisher } = setup()

    assert.equal((await publisher.publish(snapshot({ seconds: 200 }))).notificationsSent, 0)
    assert.equal((await publisher.publish(snapshot({ seconds: 110 }))).notificationsSent, 1)
    assert.equal(payloads.length, 1)
  })

  it('shares the service-status reader supplied after composition', async () => {
    const { payloads, publisher } = setup()
    publisher.setServiceStatus(() => 'after-end')

    const result = await publisher.publish(snapshot({ seconds: 30 }))

    assert.equal(result.notificationsSent, 0)
    assert.equal(payloads.length, 0)
    assert.equal(result.skipped[0]?.reason, 'not-running')
  })
})
