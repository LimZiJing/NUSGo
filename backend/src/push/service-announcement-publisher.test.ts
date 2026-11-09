import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PushNotificationPayload } from '@nusgo/shared'
import type { ServiceAnnouncement } from '../live-data/service-announcements.ts'
import { createNotificationCap } from './notification-cap.ts'
import {
  ANNOUNCEMENT_BODY_MAX_LENGTH,
  createServiceAnnouncementNotification,
  createServiceAnnouncementPublisher,
} from './service-announcement-publisher.ts'
import { createPushSubscriptionStore } from './subscription-store.ts'

function endpoint(suffix: string): string {
  return 'https://push.example.com/send/' + suffix
}

function announcement(overrides: Partial<ServiceAnnouncement> = {}): ServiceAnnouncement {
  return {
    id: '414',
    identity: '414|Term Sunday/PH schedule applies.',
    message: 'Term Sunday/PH schedule applies.',
    priority: 'medium',
    displayFromMs: Date.parse('2026-11-08T16:55:00+08:00'),
    displayToMs: Date.parse('2026-11-09T23:00:00+08:00'),
    audience: { kind: 'global' },
    ...overrides,
  }
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

describe('service announcement notification', () => {
  it('builds a short title, a one-line body and a Stops deep link', () => {
    const payload = createServiceAnnouncementNotification(announcement())

    assert.equal(payload.title, 'Service notice')
    assert.equal(payload.body, 'Term Sunday/PH schedule applies.')
    // A global notice must not be linked to an unrelated stop.
    assert.equal(payload.url, '?view=stops')
    assert.equal(payload.topic, 'service-updates')
    assert.equal(payload.tag, 'announcement:414')
  })

  it('collapses whitespace and bounds a long message to one line', () => {
    const payload = createServiceAnnouncementNotification(announcement({
      message: 'Line one\n\nline   two ' + 'x'.repeat(400),
    }))

    assert.equal(payload.body.includes('\n'), false)
    assert.ok(payload.body.length <= ANNOUNCEMENT_BODY_MAX_LENGTH)
    assert.ok(payload.body.startsWith('Line one line two '))
    assert.ok(payload.body.endsWith('…'))
  })
})

describe('service announcement publisher', () => {
  it('sends one announcement per endpoint and does not repeat it on the next cycle', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    const payloads: string[] = []
    const publisher = createServiceAnnouncementPublisher({
      store,
      cap: createNotificationCap({ maxPerHour: 4 }),
      sendNotification: async (_subscription, payload) => {
        payloads.push(payload)
        return { statusCode: 201 }
      },
      announcements: () => [announcement()],
    })

    assert.equal((await publisher.publish()).notificationsSent, 1)
    assert.equal((await publisher.publish()).notificationsSent, 0)
    assert.equal(payloads.length, 1)
    assert.equal((JSON.parse(payloads[0] ?? '{}') as PushNotificationPayload).url, '?view=stops')
  })

  it('sends the highest priority announcement first, one per endpoint per cycle', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    const topics: string[] = []
    let active: ServiceAnnouncement[] = []
    const publisher = createServiceAnnouncementPublisher({
      store,
      cap: createNotificationCap({ maxPerHour: 10 }),
      sendNotification: async (_subscription, payload) => {
        topics.push((JSON.parse(payload) as PushNotificationPayload).body)
        return { statusCode: 201 }
      },
      announcements: () => active,
    })

    active = [
      announcement({ id: 'high', identity: 'high|High notice', message: 'High notice', priority: 'high' }),
      announcement({ id: 'low', identity: 'low|Low notice', message: 'Low notice', priority: 'low' }),
    ]

    await publisher.publish()
    assert.deepEqual(topics, ['High notice'])

    await publisher.publish()
    assert.deepEqual(topics, ['High notice', 'Low notice'])
  })

  it('skips an announcement already showing when the subscription appears later', async () => {
    const store = createPushSubscriptionStore()
    const payloads: string[] = []
    const publisher = createServiceAnnouncementPublisher({
      store,
      cap: createNotificationCap({ maxPerHour: 4 }),
      sendNotification: async (_subscription, payload) => {
        payloads.push(payload)
        return { statusCode: 201 }
      },
      announcements: () => [announcement()],
    })

    assert.equal((await publisher.publish()).notificationsSent, 0)
    subscribe(store, 'a')
    assert.equal((await publisher.publish()).notificationsSent, 1)
  })

  it('retries a transient failure on the next cycle rather than dropping the announcement', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    let fail = true
    let sends = 0
    const publisher = createServiceAnnouncementPublisher({
      store,
      cap: createNotificationCap({ maxPerHour: 4 }),
      sendNotification: async () => {
        sends += 1
        if (fail) throw Object.assign(new Error('push service unavailable'), { statusCode: 503 })
        return { statusCode: 201 }
      },
      announcements: () => [announcement()],
    })

    assert.equal((await publisher.publish()).notificationsSent, 0)
    fail = false
    assert.equal((await publisher.publish()).notificationsSent, 1)
    assert.equal(sends, 2)
    assert.equal((await publisher.publish()).notificationsSent, 0)
    assert.equal(sends, 2)
  })

  it('retries after the hourly cap refused the send instead of treating it as delivered', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    const cap = createNotificationCap({ maxPerHour: 1 })
    // Spend the endpoint's only allowance so the first publish is refused.
    cap.reserve(endpoint('a'))?.commit()
    let sends = 0
    const publisher = createServiceAnnouncementPublisher({
      store,
      cap,
      sendNotification: async () => {
        sends += 1
        return { statusCode: 201 }
      },
      announcements: () => [announcement()],
    })

    assert.equal((await publisher.publish()).notificationsSent, 0)
    assert.equal(sends, 0)
    cap.reset(endpoint('a'))
    assert.equal((await publisher.publish()).notificationsSent, 1)
    assert.equal(sends, 1)
  })

  it('does not double send when two callbacks overlap', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    let releaseSend: () => void = () => undefined
    let sends = 0
    const publisher = createServiceAnnouncementPublisher({
      store,
      cap: createNotificationCap({ maxPerHour: 4 }),
      sendNotification: async () => {
        sends += 1
        return new Promise<{ statusCode: number }>((resolve) => {
          releaseSend = () => resolve({ statusCode: 201 })
        })
      },
      announcements: () => [announcement()],
    })

    const first = publisher.publish()
    const second = await publisher.publish()
    assert.equal(second.notificationsSent, 0)
    assert.equal(sends, 1)
    releaseSend()
    assert.equal((await first).notificationsSent, 1)
    assert.equal(sends, 1)
  })

  it('prunes an endpoint the push service reports as gone through the shared delivery cap', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'gone')
    const cap = createNotificationCap({ maxPerHour: 4 })
    const publisher = createServiceAnnouncementPublisher({
      store,
      cap,
      sendNotification: async () => { throw expiredSubscriptionError() },
      announcements: () => [announcement()],
    })

    const result = await publisher.publish()

    assert.deepEqual(result.prunedEndpoints, [endpoint('gone')])
    assert.equal(store.size, 0)
    assert.equal(publisher.cap, cap)
  })

  it('forgets delivery history for endpoints and announcements that are gone', async () => {
    const store = createPushSubscriptionStore()
    subscribe(store, 'a')
    let active: ServiceAnnouncement[] = [announcement()]
    let sends = 0
    const publisher = createServiceAnnouncementPublisher({
      store,
      cap: createNotificationCap({ maxPerHour: 4 }),
      sendNotification: async () => {
        sends += 1
        return { statusCode: 201 }
      },
      announcements: () => active,
    })

    await publisher.publish()
    assert.equal(sends, 1)

    // The same announcement returns after being absent from the feed, which is a new notice to
    // senders because the feed no longer vouches for it.
    active = []
    assert.equal((await publisher.publish()).activeCount, 0)
    active = [announcement()]
    assert.equal((await publisher.publish()).notificationsSent, 1)
    assert.equal(sends, 2)

    // A removed subscription also frees its history, so the next cycle starts clean.
    store.remove(endpoint('a'))
    assert.equal((await publisher.publish()).notificationsSent, 0)
    subscribe(store, 'a')
    assert.equal((await publisher.publish()).notificationsSent, 1)
    assert.equal(sends, 3)
  })
})
