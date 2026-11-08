import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_ALIGHT_REMINDER_TTL_MS,
  createAlightReminderRegistry,
  type AlightReminderRegistration,
} from './reminder-registry.ts'

const endpoint = (suffix: string): string => 'https://push.example.com/send/' + suffix
const startMs = Date.parse('2026-11-06T10:00:00Z')

const reminder = (
  suffix: string,
  stopId = 'COM3',
  routeId = 'D1',
): AlightReminderRegistration => ({
  endpoint: endpoint(suffix),
  keys: { p256dh: 'BPublicKeyValue', auth: 'AuthSecretValue' },
  topic: 'alight-reminders',
  watch: { stopId, routeId },
  leadTimeSeconds: 120,
})

function registryAt(nowRef: { value: number }, options: { maxReminders?: number; ttlMs?: number } = {}) {
  return createAlightReminderRegistry({ ...options, now: () => nowRef.value })
}

describe('alight reminder registry', () => {
  it('stores the endpoint, keys, watch, lead time and server-assigned timestamps', () => {
    const now = { value: startMs }
    const registry = registryAt(now)

    const stored = registry.upsert(reminder('a'))

    assert.deepEqual(stored, {
      endpoint: endpoint('a'),
      keys: { p256dh: 'BPublicKeyValue', auth: 'AuthSecretValue' },
      topic: 'alight-reminders',
      watch: { stopId: 'COM3', routeId: 'D1' },
      leadTimeSeconds: 120,
      createdAtMs: startMs,
      expiresAtMs: startMs + DEFAULT_ALIGHT_REMINDER_TTL_MS,
      generation: stored.generation,
    })
    // The caller's own timestamps are never trusted: they come from the registry clock.
    assert.equal(stored.createdAtMs, startMs)
  })

  it('keeps the lead time and expiry of the newest registration for an endpoint', () => {
    const now = { value: startMs }
    const registry = registryAt(now)
    registry.upsert(reminder('a'))

    now.value = startMs + 60_000
    registry.upsert({ ...reminder('a', 'CLB', 'A1'), leadTimeSeconds: 60 })

    const stored = registry.get(endpoint('a'))
    assert.equal(registry.size, 1)
    assert.deepEqual(stored?.watch, { stopId: 'CLB', routeId: 'A1' })
    assert.equal(stored?.leadTimeSeconds, 60)
    assert.equal(stored?.createdAtMs, startMs + 60_000)
    assert.equal(stored?.expiresAtMs, startMs + 60_000 + DEFAULT_ALIGHT_REMINDER_TTL_MS)
  })

  it('does not let a caller mutate a stored watch through its own object', () => {
    const registry = registryAt({ value: startMs })
    const input = reminder('a')
    registry.upsert(input)
    // Mutating the caller's object afterwards must not reach the stored record.
    ;(input.watch as { stopId: string }).stopId = 'MUTATED'

    assert.equal(registry.get(endpoint('a'))?.watch.stopId, 'COM3')
  })

  it('removes a watch and reports whether it existed', () => {
    const registry = registryAt({ value: startMs })
    registry.upsert(reminder('a'))

    assert.equal(registry.remove(endpoint('a')), true)
    assert.equal(registry.remove(endpoint('a')), false)
    assert.equal(registry.size, 0)
  })

  it('keeps a watch exactly until its expiry, then removes it on read', () => {
    const now = { value: startMs }
    const registry = registryAt(now)
    registry.upsert(reminder('a'))

    now.value = startMs + DEFAULT_ALIGHT_REMINDER_TTL_MS - 1
    assert.notEqual(registry.get(endpoint('a')), null)

    // At the boundary the watch is gone, and reading it has already removed it.
    now.value = startMs + DEFAULT_ALIGHT_REMINDER_TTL_MS
    assert.equal(registry.get(endpoint('a')), null)
    assert.equal(registry.size, 0)
  })

  it('removes expired watches before listing them and reports which endpoints went', () => {
    const now = { value: startMs }
    const registry = registryAt(now)
    registry.upsert(reminder('old'))
    now.value = startMs + 60_000
    registry.upsert(reminder('new'))

    now.value = startMs + DEFAULT_ALIGHT_REMINDER_TTL_MS
    // Only the watch registered a minute later is still inside its own two-hour window.
    assert.deepEqual(registry.pruneExpired(), [endpoint('old')])
    assert.deepEqual(registry.list().map((record) => record.endpoint), [endpoint('new')])
    assert.deepEqual(registry.pruneExpired(), [])
  })

  it('honours a shorter configured lifetime', () => {
    const now = { value: startMs }
    const registry = registryAt(now, { ttlMs: 1_000 })
    registry.upsert(reminder('a'))

    now.value = startMs + 1_000
    assert.equal(registry.get(endpoint('a')), null)
  })

  it('removes only the generation a caller evaluated, so a re-registration survives', () => {
    const registry = registryAt({ value: startMs })
    const first = registry.upsert(reminder('a'))
    const replacement = registry.upsert(reminder('a', 'CLB', 'A1'))

    // A delivery that started before the rider changed stops must not delete the newer watch.
    assert.equal(registry.removeIfCurrent(endpoint('a'), first.generation), false)
    assert.deepEqual(registry.get(endpoint('a'))?.watch, { stopId: 'CLB', routeId: 'A1' })
    assert.equal(registry.removeIfCurrent(endpoint('a'), replacement.generation), true)
    assert.equal(registry.get(endpoint('a')), null)
  })

  it('reports no removal for an endpoint that was already removed', () => {
    const registry = registryAt({ value: startMs })
    const record = registry.upsert(reminder('a'))
    registry.remove(endpoint('a'))

    assert.equal(registry.removeIfCurrent(endpoint('a'), record.generation), false)
  })

  it('evicts the oldest watch when the registry reaches its bound', () => {
    const registry = registryAt({ value: startMs }, { maxReminders: 2 })
    registry.upsert(reminder('a'))
    registry.upsert(reminder('b'))
    registry.upsert(reminder('c'))

    assert.equal(registry.size, 2)
    assert.equal(registry.get(endpoint('a')), null)
    assert.notEqual(registry.get(endpoint('c')), null)
  })
})
