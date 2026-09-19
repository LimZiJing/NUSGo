import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  loadTransitMapData,
  loadVenueData,
  type JsonFetcher,
} from './loaders'
import { TransitValidationError } from '../../domain/transit'
import { VenueValidationError } from '../../domain/venue/validation'

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
}

const network = readJson('../../../public/data/shuttle-network.json')
const geometry = readJson('../../../public/data/shuttle-routes.geojson')
const venues = readJson('../../../public/data/venues.json')

function createFetcher(payloads: Record<string, unknown>): JsonFetcher {
  return async (path) => {
    if (!(path in payloads)) throw new Error(`Unexpected resource: ${path}`)
    return payloads[path]
  }
}

describe('data loaders', () => {
  it('fetches unknown JSON, validates it, and returns an owned transit index', async () => {
    const result = await loadTransitMapData(
      new AbortController().signal,
      createFetcher({
        '/data/shuttle-network.json': network,
        '/data/shuttle-routes.geojson': geometry,
      }),
    )

    expect(result.network.routes.length).toBeGreaterThan(0)
    expect(result.geometry.features.length).toBe(result.network.routes.length)
    expect(result.index.routeById.get('A1')?.id).toBe('A1')
    expect(result.index.stopById.get('KR-MRT')?.id).toBe('KR-MRT')
  })

  it('validates venue JSON before exposing it to consumers', async () => {
    const result = await loadVenueData(
      new AbortController().signal,
      createFetcher({ 'data/venues.json': venues }),
    )

    expect(result.venueCount).toBeGreaterThan(0)
    expect(result.venues['COM1-0210']?.roomName).toBe('Seminar Room 10 (Active Learning Room)')
  })

  it('rejects malformed resources independently', async () => {
    const malformedNetwork = {
      ...(network as Record<string, unknown>),
      routes: [{ ...(network as { routes: Array<Record<string, unknown>> }).routes[0], color: 'not-a-color' }],
    }
    const malformedVenues = { 'BROKEN-1': { roomName: '' } }

    await expect(loadTransitMapData(
      new AbortController().signal,
      createFetcher({
        '/data/shuttle-network.json': malformedNetwork,
        '/data/shuttle-routes.geojson': geometry,
      }),
    )).rejects.toBeInstanceOf(TransitValidationError)

    await expect(loadVenueData(
      new AbortController().signal,
      createFetcher({ 'data/venues.json': malformedVenues }),
    )).rejects.toBeInstanceOf(VenueValidationError)

    await expect(loadTransitMapData(
      new AbortController().signal,
      createFetcher({
        '/data/shuttle-network.json': network,
        '/data/shuttle-routes.geojson': { type: 'FeatureCollection', features: [] },
      }),
    )).rejects.toThrow(/one feature per route/)
  })
})
