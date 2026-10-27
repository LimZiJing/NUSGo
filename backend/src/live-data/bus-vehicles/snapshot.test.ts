import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ParsedNusActiveBus } from '../providers/nus/active-buses.ts'
import {
  createBusVehicleSnapshotStore,
  type BusVehicleRouteLoader,
} from './snapshot.ts'

const T0 = Date.parse('2026-10-10T10:00:00.000Z')
const VEHICLE_EXPIRY_MS = 90_000
const routeIds = ['A1', 'D1']

function vehicle(plate: string): ParsedNusActiveBus {
  return { plate, lat: 1.3, lng: 103.78, headingDegrees: 90, speed: 12, load: 'low' }
}

interface FakeNus {
  readonly clock: { nowMs: number }
  readonly failing: Set<string>
  readonly vehicles: Record<string, ParsedNusActiveBus[]>
  readonly calls: string[]
  readonly loadRoute: BusVehicleRouteLoader
}

function createFakeNus(): FakeNus {
  const clock = { nowMs: T0 }
  const failing = new Set<string>()
  const vehicles: Record<string, ParsedNusActiveBus[]> = {}
  const calls: string[] = []
  const loadRoute: BusVehicleRouteLoader = async (routeId) => {
    calls.push(routeId)
    if (failing.has(routeId)) throw new Error('NUS unavailable')
    return {
      observedAt: new Date(clock.nowMs).toISOString(),
      expiresAt: new Date(clock.nowMs + VEHICLE_EXPIRY_MS).toISOString(),
      vehicles: vehicles[routeId] ?? [],
    }
  }
  return { clock, failing, vehicles, calls, loadRoute }
}

function createStore(fake: FakeNus) {
  return createBusVehicleSnapshotStore({
    routeIds,
    loadRoute: fake.loadRoute,
    refreshIntervalMs: 30_000,
    vehicleExpiryMs: VEHICLE_EXPIRY_MS,
    idleTimeoutMs: 60_000,
    maxConcurrency: 2,
    now: () => fake.clock.nowMs,
  })
}

describe('createBusVehicleSnapshotStore', () => {
  it('combines vehicles from every route that succeeds', async () => {
    const fake = createFakeNus()
    fake.vehicles.A1 = [vehicle('PD496S')]
    fake.vehicles.D1 = [vehicle('PD810T'), vehicle('PD811T')]
    const store = createStore(fake)

    const result = await store.refreshNow()
    const snapshot = store.getSnapshot()

    assert.equal(result.published, true)
    assert.deepEqual(result.successfulRouteIds, ['A1', 'D1'])
    assert.deepEqual(result.failures, [])
    assert.equal(snapshot?.observedAt, '2026-10-10T10:00:00.000Z')
    assert.equal(snapshot?.expiresAt, '2026-10-10T10:01:30.000Z')
    assert.deepEqual(snapshot?.unavailableRouteIds, [])
    assert.deepEqual(snapshot?.vehicles.map((item) => [item.routeId, item.plate, item.observedAt, item.expiresAt]), [
      ['A1', 'PD496S', '2026-10-10T10:00:00.000Z', '2026-10-10T10:01:30.000Z'],
      ['D1', 'PD810T', '2026-10-10T10:00:00.000Z', '2026-10-10T10:01:30.000Z'],
      ['D1', 'PD811T', '2026-10-10T10:00:00.000Z', '2026-10-10T10:01:30.000Z'],
    ])
  })

  it('keeps a failed route last-good vehicles until that route expires', async () => {
    const fake = createFakeNus()
    fake.vehicles.A1 = [vehicle('PD496S')]
    fake.vehicles.D1 = [vehicle('PD810T')]
    const store = createStore(fake)
    await store.refreshNow()

    fake.clock.nowMs = T0 + 30_000
    fake.failing.add('A1')
    const partial = await store.refreshNow()
    const kept = store.getSnapshot()

    assert.equal(partial.published, true)
    assert.deepEqual(partial.successfulRouteIds, ['D1'])
    assert.deepEqual(partial.failures.map((failure) => failure.routeId), ['A1'])
    assert.deepEqual(kept?.unavailableRouteIds, [])
    assert.deepEqual(kept?.vehicles.map((item) => [item.routeId, item.plate, item.observedAt]), [
      ['A1', 'PD496S', '2026-10-10T10:00:00.000Z'],
      ['D1', 'PD810T', '2026-10-10T10:00:30.000Z'],
    ])

    // A1 expired at 10:01:30. D1 was refreshed at 10:00:30, so it lasts until 10:02:00.
    fake.clock.nowMs = T0 + 90_000
    const expired = store.getSnapshot()

    assert.deepEqual(expired?.vehicles.map((item) => [item.routeId, item.plate]), [['D1', 'PD810T']])
    assert.deepEqual(expired?.unavailableRouteIds, ['A1'])
    assert.equal(expired?.expiresAt, '2026-10-10T10:02:00.000Z')
  })

  it('serves nothing after an all-failed first cycle, then keeps last-good through later failures', async () => {
    const fake = createFakeNus()
    fake.failing.add('A1')
    fake.failing.add('D1')
    const store = createStore(fake)

    const first = await store.refreshNow()

    assert.equal(first.published, false)
    assert.equal(first.failures.length, 2)
    assert.equal(store.getSnapshot(), null)

    fake.failing.delete('A1')
    fake.vehicles.A1 = [vehicle('PD496S')]
    fake.clock.nowMs = T0 + 30_000
    await store.refreshNow()

    fake.clock.nowMs = T0 + 60_000
    fake.failing.add('A1')
    const later = await store.refreshNow()

    assert.equal(later.published, false)
    assert.deepEqual(later.successfulRouteIds, [])
    assert.deepEqual(store.getSnapshot()?.vehicles.map((item) => item.plate), ['PD496S'])
    assert.deepEqual(store.getSnapshot()?.unavailableRouteIds, ['D1'])
  })

  it('skips the timer cycle while idle but lets refreshNow run', async (context) => {
    context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: T0 })
    const fake = createFakeNus()
    const store = createBusVehicleSnapshotStore({
      routeIds,
      loadRoute: fake.loadRoute,
      refreshIntervalMs: 30_000,
      vehicleExpiryMs: VEHICLE_EXPIRY_MS,
      idleTimeoutMs: 60_000,
      maxConcurrency: 2,
    })

    store.start()
    context.mock.timers.tick(0)
    assert.equal(fake.calls.length, 0)

    await store.refreshNow()
    assert.equal(fake.calls.length, 2)

    context.mock.timers.tick(30_000)
    assert.equal(fake.calls.length, 2)

    store.touch()
    context.mock.timers.tick(30_000)
    assert.equal(fake.calls.length, 4)

    await store.stop()
  })

  it('starts a cycle at once on the first touch after idle', async (context) => {
    context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: T0 })
    const fake = createFakeNus()
    const store = createBusVehicleSnapshotStore({
      routeIds,
      loadRoute: fake.loadRoute,
      refreshIntervalMs: 30_000,
      vehicleExpiryMs: VEHICLE_EXPIRY_MS,
      idleTimeoutMs: 60_000,
      maxConcurrency: 2,
    })

    store.start()
    store.touch()
    await store.refreshNow()
    assert.equal(fake.calls.length, 2)
    assert.notEqual(store.getSnapshot(), null)

    store.touch()
    await store.refreshNow()
    assert.equal(fake.calls.length, 4)

    await store.stop()
  })

  it('stop() aborts an in-flight cycle, waits for it, and publishes nothing', async () => {
    const signals: AbortSignal[] = []
    const store = createBusVehicleSnapshotStore({
      routeIds,
      loadRoute: (_routeId, signal) => {
        signals.push(signal)
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      },
      refreshIntervalMs: 30_000,
      vehicleExpiryMs: VEHICLE_EXPIRY_MS,
      idleTimeoutMs: 60_000,
      maxConcurrency: 2,
      now: () => T0,
    })

    const pending = store.refreshNow()
    await store.stop()
    const result = await pending

    assert.equal(signals.length, 2)
    assert.ok(signals.every((signal) => signal.aborted))
    assert.equal(result.published, false)
    assert.deepEqual(result.failures, [])
    assert.equal(store.getSnapshot(), null)
  })
})
