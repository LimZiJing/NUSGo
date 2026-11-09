import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createServiceAnnouncementFeed,
  selectActiveServiceAnnouncements,
  type ServiceAnnouncementRecord,
} from './service-announcements.ts'

const canonicalRouteIds = new Set(['A1', 'A2', 'D1', 'D2', 'K', 'P', 'R1', 'R2'])

function record(overrides: Partial<ServiceAnnouncementRecord> = {}): ServiceAnnouncementRecord {
  return {
    id: '414',
    message: 'Term Sunday/PH schedule applies.',
    priority: 'medium',
    displayFromMs: Date.parse('2026-11-08T16:55:00+08:00'),
    displayToMs: Date.parse('2026-11-09T23:00:00+08:00'),
    affectedServiceRouteIds: [],
    ...overrides,
  }
}

const insideWindowMs = Date.parse('2026-11-09T10:00:00+08:00')

describe('service announcement selection', () => {
  it('keeps an enabled announcement whose display window contains now', () => {
    const [announcement] = selectActiveServiceAnnouncements([record()], {
      nowMs: insideWindowMs,
      canonicalRouteIds,
    })

    assert.equal(announcement?.id, '414')
    assert.deepEqual(announcement?.audience, { kind: 'global' })
    assert.match(announcement?.identity ?? '', /^[a-f0-9]{64}$/)
  })

  it('drops an announcement whose display window has passed or has not started', () => {
    assert.deepEqual(selectActiveServiceAnnouncements([record()], {
      nowMs: Date.parse('2026-11-10T00:00:00+08:00'),
      canonicalRouteIds,
    }), [])
    assert.deepEqual(selectActiveServiceAnnouncements([record()], {
      nowMs: Date.parse('2026-11-08T12:00:00+08:00'),
      canonicalRouteIds,
    }), [])
  })

  it('treats the end of the window as expired', () => {
    assert.deepEqual(selectActiveServiceAnnouncements([record()], {
      nowMs: Date.parse('2026-11-09T23:00:00+08:00'),
      canonicalRouteIds,
    }), [])
  })

  it('scopes an announcement to the canonical routes it names', () => {
    const [announcement] = selectActiveServiceAnnouncements([
      record({ affectedServiceRouteIds: ['D1', 'a2'] }),
    ], { nowMs: insideWindowMs, canonicalRouteIds })

    assert.deepEqual(announcement?.audience, { kind: 'routes', routeIds: ['D1', 'A2'] })
  })

  it('drops an announcement that names only retired or unknown services instead of broadcasting it', () => {
    assert.deepEqual(selectActiveServiceAnnouncements([
      record({ affectedServiceRouteIds: ['BTC', 'E', 'L'] }),
    ], { nowMs: insideWindowMs, canonicalRouteIds }), [])
  })

  it('keeps only the current services from a mixed affected-service list', () => {
    const [announcement] = selectActiveServiceAnnouncements([
      record({ affectedServiceRouteIds: ['BTC', 'R1'] }),
    ], { nowMs: insideWindowMs, canonicalRouteIds })

    assert.deepEqual(announcement?.audience, { kind: 'routes', routeIds: ['R1'] })
  })

  it('orders announcements by priority, then by the most recent start', () => {
    const selected = selectActiveServiceAnnouncements([
      record({ id: 'low', priority: 'low' }),
      record({ id: 'medium-old', priority: 'medium', displayFromMs: Date.parse('2026-11-08T09:00:00+08:00') }),
      record({ id: 'high', priority: 'high' }),
      record({ id: 'medium-new', priority: 'medium' }),
    ], { nowMs: insideWindowMs, canonicalRouteIds })

    assert.deepEqual(selected.map(({ id }) => id), ['high', 'medium-new', 'medium-old', 'low'])
  })

  it('applies the feed bound after priority ordering', () => {
    const records = Array.from({ length: 50 }, (_, index) => record({ id: String(index), priority: 'low' }))
    records.push(record({ id: 'urgent', priority: 'high' }))
    const selected = selectActiveServiceAnnouncements(records, { nowMs: insideWindowMs, canonicalRouteIds })
    assert.equal(selected.length, 50)
    assert.equal(selected[0]?.id, 'urgent')
  })


  it('keeps digest keys short for long messages and changes them with route scope', () => {
    const input = record({ message: 'x'.repeat(4_096), affectedServiceRouteIds: ['D1'] })
    const [before] = selectActiveServiceAnnouncements([input], { nowMs: insideWindowMs, canonicalRouteIds })
    const [after] = selectActiveServiceAnnouncements([{ ...input, affectedServiceRouteIds: ['A2'] }],
      { nowMs: insideWindowMs, canonicalRouteIds })
    assert.equal(before?.identity.length, 64)
    assert.notEqual(before?.identity, after?.identity)
  })

  it('treats an edited message as a new identity so the correction is announced', () => {
    const [before] = selectActiveServiceAnnouncements([record()], { nowMs: insideWindowMs, canonicalRouteIds })
    const [after] = selectActiveServiceAnnouncements([
      record({ message: 'Term Sunday/PH schedule applies to all routes.' }),
    ], { nowMs: insideWindowMs, canonicalRouteIds })

    assert.notEqual(before?.identity, after?.identity)
    assert.equal(before?.id, after?.id)
  })
})

describe('service announcement feed', () => {
  it('fetches at most once per minute and shares one in-flight request', async () => {
    let nowMs = insideWindowMs
    let loads = 0
    let resolveLoad: (records: readonly ServiceAnnouncementRecord[]) => void = () => undefined
    const feed = createServiceAnnouncementFeed({
      load: () => {
        loads += 1
        return new Promise((resolve) => { resolveLoad = resolve })
      },
      canonicalRouteIds,
      now: () => nowMs,
    })

    const first = feed.refresh()
    const overlapping = feed.refresh()
    assert.equal(loads, 1)
    resolveLoad([record()])
    assert.equal((await first).length, 1)
    assert.equal((await overlapping).length, 1)

    nowMs += 30_000
    assert.equal((await feed.refresh()).length, 1)
    assert.equal(loads, 1)

    nowMs += 31_000
    void feed.refresh()
    assert.equal(loads, 2)
  })

  it('keeps the last good announcements when a refresh fails', async () => {
    let nowMs = insideWindowMs
    let fail = false
    const feed = createServiceAnnouncementFeed({
      load: async () => {
        if (fail) throw new Error('provider unavailable')
        return [record()]
      },
      canonicalRouteIds,
      now: () => nowMs,
    })

    assert.equal((await feed.refresh()).length, 1)
    fail = true
    nowMs += 61_000
    assert.equal((await feed.refresh()).length, 1)
  })

  it('rechecks display windows on cache hits and failed refreshes, with bounded retries', async () => {
    let nowMs = insideWindowMs
    let loads = 0
    const feed = createServiceAnnouncementFeed({
      now: () => nowMs,
      canonicalRouteIds,
      load: async () => {
        loads += 1
        if (loads > 1) throw new Error('unavailable')
        return [record({ displayToMs: insideWindowMs + 20_000 })]
      },
    })
    assert.equal((await feed.refresh()).length, 1)
    nowMs += 25_000
    assert.deepEqual(await feed.refresh(), [])
    assert.equal(loads, 1)
    nowMs += 40_000
    assert.deepEqual(await feed.refresh(), [])
    assert.equal(loads, 2)
    nowMs += 30_000
    await feed.refresh()
    assert.equal(loads, 2)
  })

  it('activates a cached future notice when its window begins', async () => {
    let nowMs = insideWindowMs
    const feed = createServiceAnnouncementFeed({
      now: () => nowMs,
      canonicalRouteIds,
      load: async () => [record({ displayFromMs: insideWindowMs + 20_000 })],
    })
    assert.deepEqual(await feed.refresh(), [])
    nowMs += 25_000
    assert.equal((await feed.refresh()).length, 1)
  })



})
