import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ShuttleArrivalSnapshot } from '@nusgo/shared'
import { createServiceUpdateDetector } from './service-updates.ts'

function snapshot(
  observedAt: string,
  arrivals: Readonly<Record<string, Readonly<Record<string, number>>>>,
  unavailableStopIds: readonly string[] = [],
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
    unavailableStopIds,
  }
}

const options = { delayThresholdSeconds: 180, repeatWindowMs: 30 * 60_000, now: () => Date.parse('2026-11-06T10:00:00Z') }

describe('service update detection', () => {
  it('reports a bus that fell more than the threshold behind its prediction', () => {
    const detect = createServiceUpdateDetector(options)
    const updates = detect(
      snapshot('2026-11-06T09:59:30Z', { COM3: { D1: 120 } }),
      // 30 s elapsed but the bus is now predicted 300 s away: it should have been 90 s away,
      // so it is 210 s later than the previous prediction said.
      snapshot('2026-11-06T10:00:00Z', { COM3: { D1: 300 } }),
    )

    assert.deepEqual(updates, [{ kind: 'delay', stopId: 'COM3', routeId: 'D1', delaySeconds: 210 }])
  })

  it('ignores a bus that is only slightly behind and one that made up time', () => {
    const detect = createServiceUpdateDetector(options)
    assert.deepEqual(detect(
      snapshot('2026-11-06T09:59:30Z', { COM3: { D1: 120 } }),
      snapshot('2026-11-06T10:00:00Z', { COM3: { D1: 170 } }),
    ), [])
    assert.deepEqual(detect(
      snapshot('2026-11-06T09:59:30Z', { COM3: { D1: 300 } }),
      snapshot('2026-11-06T10:00:00Z', { COM3: { D1: 120 } }),
    ), [])
  })

  it('does not treat a different bus as a delay once the predicted one should have arrived', () => {
    const detect = createServiceUpdateDetector(options)
    assert.deepEqual(detect(
      snapshot('2026-11-06T09:59:30Z', { COM3: { D1: 10 } }),
      snapshot('2026-11-06T10:00:00Z', { COM3: { D1: 600 } }),
    ), [])
  })

  it('announces a newly unavailable stop once, not again on the next refresh', () => {
    const detect = createServiceUpdateDetector(options)
    const first = detect(
      snapshot('2026-11-06T09:59:30Z', { COM3: { D1: 120 }, CLB: { D1: 120 } }),
      snapshot('2026-11-06T10:00:00Z', { COM3: { D1: 120 }, CLB: {} }, ['CLB']),
    )
    assert.deepEqual(first, [{ kind: 'unavailable', stopId: 'CLB' }])

    assert.deepEqual(detect(
      snapshot('2026-11-06T10:00:00Z', { COM3: { D1: 120 }, CLB: {} }, ['CLB']),
      snapshot('2026-11-06T10:00:30Z', { COM3: { D1: 120 }, CLB: {} }, ['CLB']),
    ), [])
  })

  it('does not announce a delay for the same stop and route again inside the repeat window', () => {
    let nowMs = Date.parse('2026-11-06T10:00:00Z')
    const detect = createServiceUpdateDetector({ ...options, now: () => nowMs })
    const delayed = (observedAt: string, seconds: number) =>
      snapshot(observedAt, { COM3: { D1: seconds } })

    assert.equal(detect(delayed('2026-11-06T09:59:30Z', 120), delayed('2026-11-06T10:00:00Z', 400)).length, 1)
    nowMs += 5 * 60_000
    assert.equal(detect(delayed('2026-11-06T10:00:00Z', 400), delayed('2026-11-06T10:05:00Z', 900)).length, 0)

    nowMs += 30 * 60_000
    // Predictions must still be in the future for the comparison to describe the same bus.
    assert.equal(detect(
      delayed('2026-11-06T10:05:00Z', 3000),
      delayed('2026-11-06T10:35:00Z', 4200),
    ).length, 1)
  })

  it('skips a stop that either snapshot did not observe', () => {
    const detect = createServiceUpdateDetector(options)
    assert.deepEqual(detect(
      snapshot('2026-11-06T09:59:30Z', {}),
      snapshot('2026-11-06T10:00:00Z', { COM3: { D1: 900 } }),
    ), [])
  })
})
