import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { TransitNetwork, TransitRouteGeometry } from '../types/transit'
import { validateTransitRouteGeometry } from './geometry'
import { validateTransitNetwork } from './model'
import { createValidTransitNetwork } from './test-fixtures'

function createValidGeometry(): TransitRouteGeometry {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { routeId: 'A1', name: 'A1', color: '#123456' },
      geometry: {
        type: 'LineString',
        coordinates: [[103, 1], [103.1, 1.1]],
      },
    }],
  }
}

function expectInvalidGeometry(
  network: TransitNetwork,
  geometry: unknown,
  expected: RegExp,
): void {
  expect(() => validateTransitRouteGeometry(network, geometry)).toThrowError(expected)
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
}

const OFFICIAL_ROUTE_COLORS: Record<string, string> = {
  A1: '#fb0101',
  A2: '#e3cf0e',
  D1: '#c77de0',
  D2: '#6e1d72',
  R1: '#ee8136',
  R2: '#008000',
  K: '#33599c',
  P: '#bebebe',
}

describe('validateTransitRouteGeometry', () => {
  it('accepts a LineString that follows the verified stop order', () => {
    const network = createValidTransitNetwork()
    const geometry = createValidGeometry()

    expect(validateTransitRouteGeometry(network, geometry)).toBe(geometry)
  })
  it('accepts the committed geometry for all verified routes', () => {
    const network = validateTransitNetwork(readJson('../../public/data/shuttle-network.json'))
    const geometry = readJson('../../public/data/shuttle-routes.geojson')

    expect(validateTransitRouteGeometry(network, geometry)).toBe(geometry)
  })


  it('uses the official route colors in both transit payloads', () => {
    const network = validateTransitNetwork(readJson('../../public/data/shuttle-network.json'))
    const geometry = readJson('../../public/data/shuttle-routes.geojson') as TransitRouteGeometry

    expect(Object.fromEntries(network.routes.map(({ id, color }) => [id, color]))).toEqual(
      OFFICIAL_ROUTE_COLORS,
    )
    expect(Object.fromEntries(
      geometry.features.map(({ properties }) => [properties.routeId, properties.color]),
    )).toEqual(OFFICIAL_ROUTE_COLORS)
  })

  it('rejects missing route features', () => {
    const geometry = createValidGeometry()
    geometry.features = []

    expectInvalidGeometry(createValidTransitNetwork(), geometry, /must contain one feature per route/)
    expectInvalidGeometry(createValidTransitNetwork(), geometry, /missing route: A1/)
  })

  it('rejects unknown route IDs', () => {
    const geometry = createValidGeometry()
    geometry.features[0].properties.routeId = 'UNKNOWN'

    expectInvalidGeometry(createValidTransitNetwork(), geometry, /references unknown route: UNKNOWN/)
  })

  it('rejects non-LineString features', () => {
    const geometry = createValidGeometry()
    const input = {
      ...geometry,
      features: [{
        ...geometry.features[0],
        geometry: { type: 'Point', coordinates: [[103, 1]] },
      }],
    }

    expectInvalidGeometry(createValidTransitNetwork(), input, /must be a LineString: Point/)
  })

  it('rejects empty or too-short coordinates', () => {
    const geometry = createValidGeometry()
    const input = {
      ...geometry,
      features: [{
        ...geometry.features[0],
        geometry: { type: 'LineString', coordinates: [] },
      }],
    }

    expectInvalidGeometry(createValidTransitNetwork(), input, /coordinates must contain at least two positions/)
  })

  it('rejects invalid coordinates', () => {
    const geometry = createValidGeometry()
    const input = {
      ...geometry,
      features: [{
        ...geometry.features[0],
        geometry: { type: 'LineString', coordinates: [[103, 1], [Number.NaN, 1.1]] },
      }],
    }

    expectInvalidGeometry(createValidTransitNetwork(), input, /coordinate 1 is invalid/)
  })

  it('rejects a line that places a stop more than 50 metres away', () => {
    const geometry = createValidGeometry()
    geometry.features[0].geometry.coordinates = [[103, 1], [103, 1]]

    expectInvalidGeometry(createValidTransitNetwork(), geometry, /route A1 stop STOP-B is .* metres from route geometry/)
  })

  it('rejects geometry that runs opposite to the verified direction', () => {
    const geometry = createValidGeometry()
    geometry.features[0].geometry.coordinates.reverse()

    expectInvalidGeometry(createValidTransitNetwork(), geometry, /route A1 geometry start is not within 50 metres of stop STOP-A/)
  })

  it('rejects route property drift', () => {
    const geometry = createValidGeometry()
    geometry.features[0].properties.color = '#654321'

    expectInvalidGeometry(createValidTransitNetwork(), geometry, /route geometry A1 color does not match the network model/)
  })
})
