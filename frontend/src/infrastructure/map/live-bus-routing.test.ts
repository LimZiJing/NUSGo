import { describe, expect, it } from 'vitest'
import type { TransitGeoJsonPosition } from '@nusgo/shared/transit/types'
import { interpolateRoutePosition, snapToRoute } from './live-bus-routing'

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
