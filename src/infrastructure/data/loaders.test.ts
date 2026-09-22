import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  loadTransitMapData,
  loadShuttleTimingData,
  loadVenueData,
  type JsonFetcher,
} from './loaders'
import {
  generateShuttleTimingData,
  TransitValidationError,
  validateTransitNetwork,
} from '../../domain/transit'
import { validateTransitRouteGeometry } from '../../domain/transit/geometry'
import { VenueValidationError } from '../../domain/venue/validation'

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
}

const network = readJson('../../../public/data/shuttle-network.json')
const geometry = readJson('../../../public/data/shuttle-routes.geojson')
const venues = readJson('../../../public/data/venues.json')
const checkedInTiming = readJson('../../../public/data/shuttle-timing.json')
const validatedNetwork = validateTransitNetwork(network)
const validatedGeometry = validateTransitRouteGeometry(validatedNetwork, geometry)
const timing = generateShuttleTimingData(validatedNetwork, validatedGeometry, '2026-09-22')

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

    expect(result.network).toBe(result.index.network)
    expect(Object.isFrozen(result.network)).toBe(true)
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

  it('loads shuttle timing and validates it against the canonical network', async () => {
    const result = await loadShuttleTimingData(
      validatedNetwork,
      new AbortController().signal,
      createFetcher({ '/data/shuttle-timing.json': checkedInTiming }),
    )

    expect(result).toBe(checkedInTiming)
    expect(result.records.length).toBeGreaterThan(0)
    expect(result.metadata.geometryVerifiedAt).toBe(validatedNetwork.metadata.verifiedAt)
  })

  it('rejects timing data that does not match the canonical network', async () => {
    await expect(loadShuttleTimingData(
      validatedNetwork,
      new AbortController().signal,
      createFetcher({
        '/data/shuttle-timing.json': {
          ...timing,
          records: timing.records.slice(1),
        },
      }),
    )).rejects.toBeInstanceOf(Error)
  })

  it('starts both transit fetches in parallel and validates network errors first', async () => {
    const calls: string[] = []
    const malformedNetwork = { ...(network as Record<string, unknown>), version: 2 }
    const malformedGeometry = { type: 'NotFeatureCollection', features: [] }
    const fetcher: JsonFetcher = (path) => {
      calls.push(path)
      const payload = path.includes('network') ? malformedNetwork : malformedGeometry
      const delay = path.includes('network') ? 20 : 0
      return new Promise((resolve) => {
        setTimeout(() => resolve(payload), delay)
      })
    }

    const pending = loadTransitMapData(new AbortController().signal, fetcher)
    expect(calls).toEqual([
      '/data/shuttle-network.json',
      '/data/shuttle-routes.geojson',
    ])
    await expect(pending).rejects.toThrow('Transit network version must be 1: 2')
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
