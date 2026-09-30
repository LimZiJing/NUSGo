import { describe, expect, it, vi } from 'vitest'
import {
  createShuttleArrivalSnapshotStore,
  refreshShuttleArrivalSnapshot,
  type ShuttleArrivalStop,
  type ShuttleArrivalStopResult,
} from './snapshot'

const stops: readonly ShuttleArrivalStop[] = [
  { stopId: 'STOP-A', stopName: 'Stop A' },
  { stopId: 'STOP-B', stopName: 'Stop B' },
  { stopId: 'STOP-C', stopName: 'Stop C' },
]

const resultFor = (stopId: string, observedAt = '2026-09-30T00:00:00.000Z'): ShuttleArrivalStopResult => ({
  observedAt,
  expiresAt: '2026-09-30T00:01:00.000Z',
  routes: {
    [stopId]: {
      nextArrivalSeconds: 120,
      upcomingArrivalSeconds: [120, 480],
      headwaySeconds: { min: 360, max: 360, median: 360 },
    },
  },
})

const previousSnapshot = {
  observedAt: '2026-09-29T23:59:30.000Z',
  expiresAt: '2026-09-30T00:00:30.000Z',
  snapshotVersion: 'old',
  refreshedAt: '2026-09-29T23:59:30.000Z',
  nextRefreshAt: '2026-09-30T00:00:00.000Z',
  stops: {
    'STOP-A': resultFor('STOP-A').routes,
    'STOP-B': resultFor('STOP-B').routes,
    'STOP-C': resultFor('STOP-C').routes,
  },
  stopObservations: {
    'STOP-A': { observedAt: '2026-09-29T23:59:30.000Z', expiresAt: '2026-09-30T00:00:30.000Z' },
    'STOP-B': { observedAt: '2026-09-29T23:59:30.000Z', expiresAt: '2026-09-30T00:00:30.000Z' },
    'STOP-C': { observedAt: '2026-09-29T23:59:30.000Z', expiresAt: '2026-09-30T00:00:30.000Z' },
  },
} as const

describe('refreshShuttleArrivalSnapshot', () => {
  it('publishes all stops together after every request settles', async () => {
    const loadStop = vi.fn(async (stop: ShuttleArrivalStop) => resultFor(stop.stopId))

    const result = await refreshShuttleArrivalSnapshot(stops, loadStop, {
      snapshotVersion: 'new',
      refreshIntervalMs: 30_000,
      now: () => Date.parse('2026-09-30T00:00:01.000Z'),
    })

    expect(loadStop).toHaveBeenCalledTimes(3)
    expect(result.published).toBe(true)
    expect(Object.keys(result.snapshot?.stops ?? {})).toEqual(['STOP-A', 'STOP-B', 'STOP-C'])
    expect(result.snapshot?.snapshotVersion).toBe('new')
    expect(result.snapshot?.nextRefreshAt).toBe('2026-09-30T00:00:31.000Z')
  })

  it('does not publish until a slow stop settles', async () => {
    let resolveSlow: (value: ShuttleArrivalStopResult) => void = () => undefined
    const loadStop = vi.fn((stop: ShuttleArrivalStop) => {
      if (stop.stopId === 'STOP-C') {
        return new Promise<ShuttleArrivalStopResult>((resolve) => { resolveSlow = resolve })
      }
      return Promise.resolve(resultFor(stop.stopId))
    })

    const refresh = refreshShuttleArrivalSnapshot(stops, loadStop, {
      snapshotVersion: 'new',
      refreshIntervalMs: 30_000,
      now: () => Date.parse('2026-09-30T00:00:01.000Z'),
    })
    let settled = false
    void refresh.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)

    resolveSlow(resultFor('STOP-C'))
    await expect(refresh).resolves.toMatchObject({ published: true })
  })

  it('preserves the previous value for a failed stop and marks a new failed stop unavailable', async () => {
    const loadStop = vi.fn(async (stop: ShuttleArrivalStop) => {
      if (stop.stopId !== 'STOP-A') throw new Error(`Failed ${stop.stopId}`)
      return resultFor(stop.stopId, '2026-09-30T00:00:01.000Z')
    })

    const result = await refreshShuttleArrivalSnapshot(stops, loadStop, {
      previousSnapshot,
      snapshotVersion: 'new',
      refreshIntervalMs: 30_000,
      now: () => Date.parse('2026-09-30T00:00:02.000Z'),
    })

    expect(result.published).toBe(true)
    expect(result.failures.map(({ stopId }) => stopId)).toEqual(['STOP-B', 'STOP-C'])
    expect(result.snapshot?.stops['STOP-B']).toEqual(previousSnapshot.stops['STOP-B'])
    expect(result.snapshot?.stops['STOP-C']).toEqual(previousSnapshot.stops['STOP-C'])
    expect(result.snapshot?.stopObservations?.['STOP-B']).toEqual(previousSnapshot.stopObservations['STOP-B'])
  })

  it('keeps the previous snapshot when every stop fails', async () => {
    const loadStop = vi.fn(async () => { throw new Error('NUS unavailable') })

    const result = await refreshShuttleArrivalSnapshot(stops, loadStop, {
      previousSnapshot,
      snapshotVersion: 'new',
      refreshIntervalMs: 30_000,
    })

    expect(result.published).toBe(false)
    expect(result.snapshot).toBe(previousSnapshot)
    expect(result.failures).toHaveLength(3)
  })
})

describe('createShuttleArrivalSnapshotStore', () => {
  it('does not expose a partial snapshot and shares an in-flight refresh', async () => {
    let resolveStop: (value: ShuttleArrivalStopResult) => void = () => undefined
    const loadStop = vi.fn((stop: ShuttleArrivalStop) => {
      if (stop.stopId === 'STOP-A') {
        return new Promise<ShuttleArrivalStopResult>((resolve) => { resolveStop = resolve })
      }
      return Promise.resolve(resultFor(stop.stopId))
    })
    const store = createShuttleArrivalSnapshotStore({
      stops,
      loadStop,
      refreshIntervalMs: 30_000,
    })

    const first = store.refreshNow()
    const second = store.refreshNow()
    expect(first).toBe(second)
    expect(store.getSnapshot()).toBeNull()

    resolveStop(resultFor('STOP-A'))
    await first
    expect(Object.keys(store.getSnapshot()?.stops ?? {})).toHaveLength(3)
  })

  it('keeps the published snapshot while a later refresh is running', async () => {
    let callCount = 0
    let resolveRefresh: () => void = () => undefined
    const loadStop = vi.fn(async (stop: ShuttleArrivalStop) => {
      callCount += 1
      if (callCount > stops.length && stop.stopId === 'STOP-A') {
        await new Promise<void>((resolve) => { resolveRefresh = resolve })
      }
      return resultFor(stop.stopId)
    })
    const store = createShuttleArrivalSnapshotStore({
      stops,
      loadStop,
      refreshIntervalMs: 30_000,
    })

    await store.refreshNow()
    const firstSnapshot = store.getSnapshot()
    const refresh = store.refreshNow()
    await Promise.resolve()
    expect(store.getSnapshot()).toBe(firstSnapshot)

    resolveRefresh()
    await refresh
    expect(store.getSnapshot()?.snapshotVersion).not.toBe(firstSnapshot?.snapshotVersion)
  })
})
