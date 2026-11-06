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
import { createAlightReminderRegistry, type AlightReminderRecord } from './reminder-registry.ts'

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

function reminder(suffix: string, stopId = 'COM3', routeId = 'D1'): AlightReminderRecord {
  return {
    endpoint: endpoint(suffix),
    keys: { p256dh: 'BPublicKeyValue', auth: 'AuthSecretValue' },
    topic: 'alight-reminders',
    watch: { stopId, routeId },
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
  it('fires when the next bus for the watched stop and route is at the threshold', () => {
    const result = evaluate([reminder('a')], snapshot({ seconds: 120 }))

    assert.equal(result.skipped.length, 0)
    assert.deepEqual(result.due.map(({ stopId, routeId, minutesUntilArrival }) => ({
      stopId,
      routeId,
      minutes: minutesUntilArrival,
    })), [{ stopId: 'COM3', routeId: 'D1', minutes: 2 }])
  })

  it('does not fire while the next bus is still further away than the threshold', () => {
    const result = evaluate([reminder('a')], snapshot({ seconds: 600 }))

    assert.deepEqual(result.due, [])
    assert.equal(skipReason(result, 'a'), 'not-yet-close')
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

  it('does not fire again for an arrival it already announced', () => {
    const result = evaluateAlightReminders([reminder('a')], snapshot({ seconds: 30 }), {
      now: () => nowMs,
      alreadySent: () => true,
    })
    assert.deepEqual(result.due, [])
    assert.equal(skipReason(result, 'a'), 'already-sent')
  })

  it('evaluates each watch independently', () => {
    const records = [reminder('close', 'COM3', 'D1'), reminder('far', 'COM3', 'A1')]
    const result = evaluate(records, snapshot({ routes: { D1: 30, A1: 900 } }))

    assert.deepEqual(result.due.map(({ record }) => record.endpoint), [endpoint('close')])
    assert.equal(skipReason(result, 'far'), 'not-yet-close')
  })
})

describe('alight reminder publisher', () => {
  function setup() {
    const registry = createAlightReminderRegistry()
    registry.upsert(reminder('a'))
    const payloads: string[] = []
    const sendNotification: PushSendNotification = async (_subscription, payload) => {
      payloads.push(payload)
      return { statusCode: 201 }
    }
    const publisher = createAlightReminderPublisher({
      registry,
      push,
      stopName: (stopId) => (stopId === 'COM3' ? 'COM3 Opp' : null),
      sendNotification,
      now: () => nowMs,
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

  it('sends nothing for a stale snapshot and re-arms once the next bus is far away', async () => {
    const { payloads, publisher } = setup()

    assert.equal((await publisher.publish(snapshot({ expiresAt: '2026-11-06T09:59:00Z' }))).notificationsSent, 0)
    assert.equal((await publisher.publish(snapshot({ seconds: 600 }))).notificationsSent, 0)
    assert.equal((await publisher.publish(snapshot({ seconds: 90 }))).notificationsSent, 1)
    assert.equal(payloads.length, 1)
  })

  it('pushes once per arrival, not on every refresh', async () => {
    const { payloads, publisher } = setup()

    assert.equal((await publisher.publish(snapshot({ seconds: 110 }))).notificationsSent, 1)
    assert.equal((await publisher.publish(snapshot({ seconds: 80 }))).notificationsSent, 0)
    assert.equal(payloads.length, 1)
  })

  it('removes an endpoint the push service reports as gone', async () => {
    const registry = createAlightReminderRegistry()
    registry.upsert(reminder('gone'))
    const publisher = createAlightReminderPublisher({
      registry,
      push,
      stopName: () => 'COM3 Opp',
      sendNotification: async () => { throw Object.assign(new Error('expired'), { statusCode: 410 }) },
      now: () => nowMs,
    })

    const result = await publisher.publish(snapshot({ seconds: 60 }))

    assert.deepEqual(result.prunedEndpoints, [endpoint('gone')])
    assert.equal(registry.size, 0)
  })

  it('respects the hourly cap and re-arms the watch when the reminder is forgotten', async () => {
    const registry = createAlightReminderRegistry()
    registry.upsert(reminder('a'))
    let sends = 0
    const publisher = createAlightReminderPublisher({
      registry,
      push: { ...push, notificationsPerHourCap: 1 },
      stopName: () => 'COM3 Opp',
      sendNotification: async () => { sends += 1; return { statusCode: 201 } },
      now: () => nowMs,
    })

    assert.equal((await publisher.publish(snapshot({ seconds: 60 }))).notificationsSent, 1)
    // Re-armed, but the hourly cap refuses the second notification in the same hour.
    assert.equal((await publisher.publish(snapshot({ seconds: 900 }))).notificationsSent, 0)
    assert.equal((await publisher.publish(snapshot({ seconds: 60 }))).notificationsSent, 0)
    publisher.forgetSubscription(endpoint('a'))
    assert.equal((await publisher.publish(snapshot({ seconds: 60 }))).notificationsSent, 1)
    assert.equal(sends, 2)
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
