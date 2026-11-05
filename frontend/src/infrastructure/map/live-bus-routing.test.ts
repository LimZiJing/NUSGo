import { describe, expect, it } from 'vitest'
import type { TransitGeoJsonPosition } from '@nusgo/shared/transit/types'
import {
  interpolateRoutePosition,
  matchVehicleRoutePosition,
  snapToRoute,
} from './live-bus-routing'

describe('live bus route positions', () => {
  it('snaps a vehicle to the nearest point on its route line', () => {
    const position = snapToRoute(
      [103.785, 1.301],
      [[103.78, 1.3], [103.79, 1.3], [103.79, 1.31]],
    )

    expect(position?.coordinate[0]).toBeCloseTo(103.785, 6)
    expect(position?.coordinate[1]).toBeCloseTo(1.3, 6)
    expect(position?.progressMeters).toBeCloseTo(556, 0)
  })

  it('uses heading to choose the initial branch at a route crossing', () => {
    const route: TransitGeoJsonPosition[] = [
      [0, 0], [0.002, 0.002], [0, 0.002], [0.002, 0],
    ]

    const match = matchVehicleRoutePosition(
      [0.001, 0.001],
      135,
      route,
      null,
      0,
    )

    expect(match.kind).toBe('matched')
    if (match.kind === 'matched') {
      expect(match.continuity).toBe('initial')
      expect(match.position.progressMeters).toBeGreaterThan(600)
    }
  })

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    'uses distance and progress continuity when heading is missing or invalid (%s)',
    (headingDegrees) => {
      const route: TransitGeoJsonPosition[] = [[0, 0], [0.02, 0]]
      const previous = snapToRoute([0.005, 0], route)
      expect(previous).not.toBeNull()

      const match = matchVehicleRoutePosition(
        [0.006, 0],
        headingDegrees,
        route,
        { progressMeters: previous?.progressMeters ?? 0, observedAtMs: 0 },
        30_000,
      )

      expect(match.kind).toBe('matched')
      if (match.kind === 'matched') {
        expect(match.continuity).toBe('continuous')
        expect(match.position.coordinate[0]).toBeCloseTo(0.006, 6)
        expect(match.progressDeltaMeters).toBeGreaterThan(0)
      }
    },
  )

  it('uses the nearest route position for an initial sighting without heading', () => {
    const route: TransitGeoJsonPosition[] = [[0, 0], [0.02, 0]]

    const match = matchVehicleRoutePosition([0.006, 0], undefined, route, null, 0)

    expect(match.kind).toBe('matched')
    if (match.kind === 'matched') {
      expect(match.continuity).toBe('initial')
      expect(match.position.coordinate[0]).toBeCloseTo(0.006, 6)
    }
  })

  it('rejects duplicate and out-of-order observations', () => {
    const route: TransitGeoJsonPosition[] = [[0, 0], [0.02, 0]]
    const previous = snapToRoute([0.005, 0], route)
    expect(previous).not.toBeNull()

    for (const observedAtMs of [30_000, 15_000]) {
      const match = matchVehicleRoutePosition(
        [0.006, 0],
        90,
        route,
        { progressMeters: previous?.progressMeters ?? 0, observedAtMs: 30_000 },
        observedAtMs,
      )

      expect(match.kind).toBe('rejected')
    }
  })

  it('keeps a vehicle on its continuous branch when a nearby loop branch is closer to GPS', () => {
    const loop: TransitGeoJsonPosition[] = [
      [0, 0], [0.02, 0], [0.02, 0.00005], [0, 0.00005], [0, 0],
    ]
    const previous = snapToRoute([0.009, 0], loop)
    expect(previous).not.toBeNull()

    const match = matchVehicleRoutePosition(
      [0.01, 0.00005],
      90,
      loop,
      { progressMeters: previous?.progressMeters ?? 0, observedAtMs: 0 },
      30_000,
    )

    expect(match.kind).toBe('matched')
    if (match.kind === 'matched') {
      expect(match.position.coordinate[1]).toBeCloseTo(0, 7)
      expect(match.position.progressMeters).toBeLessThan(1_200)
    }
  })

  it('matches forward movement across the start of a closed route', () => {
    const loop: TransitGeoJsonPosition[] = [
      [0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0],
    ]
    const previous = snapToRoute([0, 0.0001], loop)
    expect(previous).not.toBeNull()

    const match = matchVehicleRoutePosition(
      [0.0001, 0],
      90,
      loop,
      { progressMeters: previous?.progressMeters ?? 0, observedAtMs: 0 },
      30_000,
    )

    expect(match.kind).toBe('matched')
    if (match.kind === 'matched') {
      expect(match.continuity).toBe('continuous')
      expect(match.position.coordinate[0]).toBeCloseTo(0.0001, 6)
      expect(match.position.progressMeters).toBeLessThan(20)
    }
  })

  it('uses bus heading to choose between close route branches with plausible progress', () => {
    const loop: TransitGeoJsonPosition[] = [
      [0, 0], [0.0005, 0], [0.0005, 0.0002], [0, 0.0002], [0, 0],
    ]
    const previous = snapToRoute([0.0002, 0], loop)
    expect(previous).not.toBeNull()

    const match = matchVehicleRoutePosition(
      [0.00022, 0.0001],
      270,
      loop,
      { progressMeters: previous?.progressMeters ?? 0, observedAtMs: 0 },
      30_000,
    )

    expect(match.kind).toBe('matched')
    if (match.kind === 'matched' && match.continuity === 'continuous') {
      expect(match.position.coordinate[1]).toBeCloseTo(0.0002, 7)
      expect(match.position.progressMeters).toBeGreaterThan(80)
      expect(match.progressDeltaMeters).toBeGreaterThan(0)
      const midpoint = interpolateRoutePosition(
        loop,
        previous?.progressMeters ?? 0,
        match.position.progressMeters,
        0.5,
        match.progressDeltaMeters,
      )
      expect(midpoint?.coordinate[0]).toBeCloseTo(0.0005, 7)
      expect(midpoint?.coordinate[1]).toBeCloseTo(0.00009, 7)
    }
  })

  it('keeps a small closed-loop GPS drift within the movement bound when heading favors the opposite direction', () => {
    const loop: TransitGeoJsonPosition[] = [
      [0, 0], [0.02, 0], [0.02, 0.01], [0, 0.01], [0, 0],
    ]
    const previous = snapToRoute([0.01, 0], loop)
    expect(previous).not.toBeNull()

    const match = matchVehicleRoutePosition(
      [0.009999, 0],
      90,
      loop,
      { progressMeters: previous?.progressMeters ?? 0, observedAtMs: 0 },
      30_000,
    )

    expect(match.kind).toBe('matched')
    if (match.kind === 'matched' && match.continuity === 'continuous') {
      expect(match.progressDeltaMeters).toBeLessThan(0)
      expect(Math.abs(match.progressDeltaMeters)).toBeLessThan(1)
    }
  })

  it('accepts reverse travel along an open route when heading agrees', () => {
    const route: TransitGeoJsonPosition[] = [[0, 0], [0.001, 0]]
    const previous = snapToRoute([0.0005, 0], route)
    expect(previous).not.toBeNull()

    const match = matchVehicleRoutePosition(
      [0.0004, 0],
      270,
      route,
      { progressMeters: previous?.progressMeters ?? 0, observedAtMs: 0 },
      30_000,
    )

    expect(match.kind).toBe('matched')
    if (match.kind === 'matched') {
      expect(match.position.progressMeters).toBeLessThan(previous?.progressMeters ?? 0)
    }
  })

  it('rejects movement beyond the configured bus travel bound', () => {
    const route: TransitGeoJsonPosition[] = [[0, 0], [0.02, 0]]
    const previous = snapToRoute([0.005, 0], route)
    expect(previous).not.toBeNull()

    const match = matchVehicleRoutePosition(
      [0.02, 0],
      90,
      route,
      { progressMeters: previous?.progressMeters ?? 0, observedAtMs: 0 },
      30_000,
    )

    expect(match.kind).toBe('rejected')
  })

  it('reacquires directly after the continuity horizon', () => {
    const route: TransitGeoJsonPosition[] = [[0, 0], [0.02, 0]]
    const previous = snapToRoute([0.005, 0], route)
    expect(previous).not.toBeNull()

    const match = matchVehicleRoutePosition(
      [0.019, 0],
      90,
      route,
      { progressMeters: previous?.progressMeters ?? 0, observedAtMs: 0 },
      90_001,
    )

    expect(match.kind).toBe('matched')
    if (match.kind === 'matched') {
      expect(match.continuity).toBe('reacquired')
      expect(match.position.coordinate[0]).toBeCloseTo(0.019, 6)
    }
  })

  it('interpolates along the route geometry between two observed positions', () => {
    const route: TransitGeoJsonPosition[] = [[0, 0], [0.001, 0]]
    const position = interpolateRoutePosition(route, 0, 111.2, 0.5)

    expect(position?.coordinate[0]).toBeCloseTo(0.0005, 6)
    expect(position?.coordinate[1]).toBe(0)
  })

  it('interpolates through a route loop across its start point', () => {
    const loop: TransitGeoJsonPosition[] = [
      [0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0],
    ]
    const start = snapToRoute([0, 0.0001], loop)
    const end = snapToRoute([0.0001, 0], loop)

    expect(start).not.toBeNull()
    expect(end).not.toBeNull()
    const position = interpolateRoutePosition(
      loop,
      start?.progressMeters ?? 0,
      end?.progressMeters ?? 0,
      0.5,
    )

    expect(position?.coordinate[0]).toBeCloseTo(0, 6)
    expect(position?.coordinate[1]).toBe(0)
  })
})
