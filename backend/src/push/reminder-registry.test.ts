import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createAlightReminderRegistry } from './reminder-registry.ts'

const endpoint = (suffix: string): string => 'https://push.example.com/send/' + suffix

const reminder = (suffix: string, stopId = 'COM3', routeId = 'D1') => ({
  endpoint: endpoint(suffix),
  keys: { p256dh: 'BPublicKeyValue', auth: 'AuthSecretValue' },
  topic: 'alight-reminders' as const,
  watch: { stopId, routeId },
})

describe('alight reminder registry', () => {
  it('stores only the endpoint, keys and the watched stop and route', () => {
    const registry = createAlightReminderRegistry()
    registry.upsert(reminder('a'))

    assert.deepEqual(registry.get(endpoint('a')), {
      endpoint: endpoint('a'),
      keys: { p256dh: 'BPublicKeyValue', auth: 'AuthSecretValue' },
      topic: 'alight-reminders',
      watch: { stopId: 'COM3', routeId: 'D1' },
    })
  })

  it('keeps one watch per endpoint and replaces it when the rider changes stop or route', () => {
    const registry = createAlightReminderRegistry()
    registry.upsert(reminder('a'))
    registry.upsert(reminder('a', 'CLB', 'A1'))

    assert.equal(registry.size, 1)
    assert.deepEqual(registry.get(endpoint('a'))?.watch, { stopId: 'CLB', routeId: 'A1' })
  })

  it('does not let a caller mutate a stored watch through its own object', () => {
    const registry = createAlightReminderRegistry()
    const input = reminder('a')
    registry.upsert(input)
    input.watch.stopId = 'MUTATED'

    assert.equal(registry.get(endpoint('a'))?.watch.stopId, 'COM3')
  })

  it('removes a watch and reports whether it existed', () => {
    const registry = createAlightReminderRegistry()
    registry.upsert(reminder('a'))

    assert.equal(registry.remove(endpoint('a')), true)
    assert.equal(registry.remove(endpoint('a')), false)
    assert.equal(registry.size, 0)
  })

  it('evicts the oldest watch when the registry reaches its bound', () => {
    const registry = createAlightReminderRegistry({ maxReminders: 2 })
    registry.upsert(reminder('a'))
    registry.upsert(reminder('b'))
    registry.upsert(reminder('c'))

    assert.equal(registry.size, 2)
    assert.equal(registry.get(endpoint('a')), null)
    assert.notEqual(registry.get(endpoint('c')), null)
  })
})
