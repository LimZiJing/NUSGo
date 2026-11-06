import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createNotificationCap } from './notification-cap.ts'
import { createPushSubscriptionStore } from './subscription-store.ts'

const endpoint = (suffix: string): string => 'https://push.example.com/send/' + suffix

const registration = (suffix: string) => ({
  endpoint: endpoint(suffix),
  keys: { p256dh: 'BPublicKeyValue', auth: 'AuthSecretValue' },
  topic: 'service-updates' as const,
})

describe('push subscription store', () => {
  it('stores only the endpoint, keys and chosen topic', () => {
    const store = createPushSubscriptionStore()
    store.add(registration('a'))

    const stored = store.get(endpoint('a'))
    assert.deepEqual(stored, {
      endpoint: endpoint('a'),
      keys: { p256dh: 'BPublicKeyValue', auth: 'AuthSecretValue' },
      topic: 'service-updates',
    })
  })

  it('replaces an existing endpoint and keeps one record per endpoint', () => {
    const store = createPushSubscriptionStore()
    store.add(registration('a'))
    store.add({ ...registration('a'), keys: { p256dh: 'BRotatedKey', auth: 'RotatedAuth' } })

    assert.equal(store.size, 1)
    assert.equal(store.get(endpoint('a'))?.keys.p256dh, 'BRotatedKey')
  })

  it('removes a subscription and reports whether it existed', () => {
    const store = createPushSubscriptionStore()
    store.add(registration('a'))

    assert.equal(store.remove(endpoint('a')), true)
    assert.equal(store.remove(endpoint('a')), false)
    assert.equal(store.size, 0)
  })

  it('lists subscriptions by topic without exposing another topic', () => {
    const store = createPushSubscriptionStore()
    store.add(registration('a'))

    assert.equal(store.list('service-updates').length, 1)
    assert.equal(store.list().length, 1)
  })

  it('evicts the oldest registration when the store reaches its bound', () => {
    const store = createPushSubscriptionStore({ maxSubscriptions: 2 })
    store.add(registration('a'))
    store.add(registration('b'))
    store.add(registration('c'))

    assert.equal(store.size, 2)
    assert.equal(store.get(endpoint('a')), null)
    assert.notEqual(store.get(endpoint('c')), null)
  })
})

describe('notification hourly cap', () => {
  it('rejects delivery past the cap and allows it again in the next hour', () => {
    let nowMs = 1_000
    const cap = createNotificationCap({ maxPerHour: 2, now: () => nowMs })

    assert.equal(cap.tryConsume(endpoint('a')), true)
    assert.equal(cap.tryConsume(endpoint('a')), true)
    assert.equal(cap.tryConsume(endpoint('a')), false)

    // Just under an hour later the same window still applies.
    nowMs += 60 * 60_000 - 1
    assert.equal(cap.tryConsume(endpoint('a')), false)

    nowMs += 1
    assert.equal(cap.tryConsume(endpoint('a')), true)
  })

  it('keeps the cap independent per subscription', () => {
    const cap = createNotificationCap({ maxPerHour: 1 })
    assert.equal(cap.tryConsume(endpoint('a')), true)
    assert.equal(cap.tryConsume(endpoint('a')), false)
    assert.equal(cap.tryConsume(endpoint('b')), true)
  })

  it('forgets a subscription window on reset', () => {
    const cap = createNotificationCap({ maxPerHour: 1 })
    assert.equal(cap.tryConsume(endpoint('a')), true)
    cap.reset(endpoint('a'))
    assert.equal(cap.tryConsume(endpoint('a')), true)
    assert.equal(cap.trackedCount, 1)
  })
})
