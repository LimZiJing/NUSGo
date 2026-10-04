import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  validateTransitNetwork,
  validateTransitRouteGeometry,
  validateTransitVerificationManifest,
} from './index'

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
}

describe('checked-in transit integrity gate', () => {
  it('accepts the committed network, route geometry, and verification manifest together', () => {
    const network = validateTransitNetwork(readJson('../../../public/data/shuttle-network.json'))
    const geometry = validateTransitRouteGeometry(
      network,
      readJson('../../../public/data/shuttle-routes.geojson'),
    )
    const manifest = validateTransitVerificationManifest(
      network,
      readJson('../../../public/data/transit-verification.json'),
    )

    expect(geometry.features.map(({ properties }) => properties.routeId)).toEqual(
      network.routes.map(({ id }) => id),
    )
    expect(manifest.routes.map(({ routeId }) => routeId)).toEqual(
      network.routes.map(({ id }) => id),
    )
  })
})
