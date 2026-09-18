import { describe, expect, it } from 'vitest'
import type {
  TransitGeoJsonPosition,
  TransitRouteGeometry,
  TransitRouteGeometryFeature,
} from '../types/transit'
import { deriveTransitRouteOverlapMap } from './overlap'

function createFeature(
  routeId: string,
  coordinates: TransitGeoJsonPosition[],
): TransitRouteGeometryFeature {
  return {
    type: 'Feature',
    properties: { routeId, name: routeId, color: '#123456' },
    geometry: { type: 'LineString', coordinates },
  }
}

function createGeometry(features: TransitRouteGeometryFeature[]): TransitRouteGeometry {
  return { type: 'FeatureCollection', features }
}

describe('deriveTransitRouteOverlapMap', () => {
  it('finds meaningful near-coincident corridors in both directions', () => {
    const geometry = createGeometry([
      createFeature('A1', [[103, 1], [103.0001, 1], [103.0003, 1]]),
      createFeature('A2', [[103, 1.00009], [103.0001, 1.00009], [103.0003, 1.00009]]),
      createFeature('P', [[104, 2], [104.0003, 2]]),
    ])

    const overlaps = deriveTransitRouteOverlapMap(geometry)
    const reversedOverlaps = deriveTransitRouteOverlapMap(createGeometry([...geometry.features].reverse()))

    expect(Array.from(overlaps.keys())).toEqual(['A1', 'A2'])
    expect(Array.from(overlaps.get('A1') ?? [])).toEqual(['A2'])
    expect(Array.from(overlaps.get('A2') ?? [])).toEqual(['A1'])
    expect(overlaps.has('P')).toBe(false)
    expect(Array.from(overlaps.entries())).toEqual(Array.from(reversedOverlaps.entries()))
  })

  it('requires at least 20 metres of continuous near-coincident geometry', () => {
    const geometry = createGeometry([
      createFeature('SHORT-A', [[103, 1], [103.0001, 1]]),
      createFeature('SHORT-B', [[103, 1.00009], [103.0001, 1.00009]]),
    ])

    expect(deriveTransitRouteOverlapMap(geometry)).toEqual(new Map())
  })

  it('uses the 15 metre tolerance and ignores point crossings', () => {
    const geometry = createGeometry([
      createFeature('NEAR-A', [[103, 1], [103.0003, 1]]),
      createFeature('NEAR-B', [[103, 1 + 14.99 / 110540], [103.0003, 1 + 14.99 / 110540]]),
      createFeature('FAR', [[103, 1 - 15.01 / 110540], [103.0003, 1 - 15.01 / 110540]]),
      createFeature('CROSS', [[103.00015, 0.9998], [103.00015, 1.0002]]),
    ])

    const overlaps = deriveTransitRouteOverlapMap(geometry)

    expect(Array.from(overlaps.get('NEAR-A') ?? [])).toEqual(['NEAR-B'])
    expect(overlaps.has('FAR')).toBe(false)
    expect(overlaps.has('CROSS')).toBe(false)
  })

  it('accepts a continuous corridor once it reaches 20 metres', () => {
    const longitudeDelta = 20.1 / (111320 * Math.cos(Math.PI / 180))
    const latitudeOffset = 10 / 110540
    const geometry = createGeometry([
      createFeature('MIN-A', [[103, 1], [103 + longitudeDelta, 1]]),
      createFeature('MIN-B', [[103, 1 + latitudeOffset], [103 + longitudeDelta, 1 + latitudeOffset]]),
    ])

    expect(Array.from(deriveTransitRouteOverlapMap(geometry).keys())).toEqual(['MIN-A', 'MIN-B'])
  })
})
