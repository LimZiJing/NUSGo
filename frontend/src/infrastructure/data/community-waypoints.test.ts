import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { loadCommunityWaypoints } from './community-waypoints'
import type { JsonFetcher } from './loaders'

const validFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [103.7764, 1.2966] },
  properties: {
    id: 'cw-7f0d8a24-93de-4e30-a02c-6f8cbd064120',
    name: 'Test water cooler',
    category: 'water_cooler',
    source: 'Example for loader test',
    updatedAt: '2026-10-30',
  },
}

const validCollection = { type: 'FeatureCollection', features: [validFeature] }

function createFetcher(payload: unknown): JsonFetcher {
  return vi.fn().mockResolvedValue(payload)
}

describe('loadCommunityWaypoints', () => {
  it('fetches the public collection and returns validated Community Waypoints', async () => {
    const signal = new AbortController().signal
    const fetcher = createFetcher(validCollection)

    const waypoints = await loadCommunityWaypoints(signal, fetcher)

    expect(fetcher).toHaveBeenCalledWith('/data/community-waypoints.geojson', signal, 'Community waypoints')
    expect(waypoints).toEqual([{
      id: 'cw-7f0d8a24-93de-4e30-a02c-6f8cbd064120',
      name: 'Test water cooler',
      category: 'water_cooler',
      coordinate: { longitude: 103.7764, latitude: 1.2966 },
      source: 'Example for loader test',
      updatedAt: '2026-10-30',
    }])
  })

  it('returns an empty list for a valid empty collection', async () => {
    await expect(loadCommunityWaypoints(
      new AbortController().signal,
      createFetcher({ type: 'FeatureCollection', features: [] }),
    )).resolves.toEqual([])
  })

  it('rejects a malformed feature', async () => {
    await expect(loadCommunityWaypoints(
      new AbortController().signal,
      createFetcher({ type: 'FeatureCollection', features: [{ type: 'Feature' }] }),
    )).rejects.toThrow('features[0].geometry')
  })

  it('rejects duplicate Community Waypoint IDs', async () => {
    await expect(loadCommunityWaypoints(
      new AbortController().signal,
      createFetcher({ type: 'FeatureCollection', features: [validFeature, validFeature] }),
    )).rejects.toThrow('must be unique within the collection')
  })

  it('rejects unsupported categories', async () => {
    const unsupported = {
      ...validFeature,
      properties: { ...validFeature.properties, category: 'staff_room' },
    }

    await expect(loadCommunityWaypoints(
      new AbortController().signal,
      createFetcher({ type: 'FeatureCollection', features: [unsupported] }),
    )).rejects.toThrow('must be a supported Community Waypoint category')
  })

  it('preserves fetch failures instead of presenting them as an empty collection', async () => {
    await expect(loadCommunityWaypoints(
      new AbortController().signal,
      vi.fn().mockRejectedValue(new Error('Community Waypoints request failed: 404')),
    )).rejects.toThrow('Community Waypoints request failed: 404')
  })

  it('preserves cancellation as an abort', async () => {
    const controller = new AbortController()
    const fetcher: JsonFetcher = (_path, signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })

    const pending = loadCommunityWaypoints(controller.signal, fetcher)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('loads the empty checked-in public dataset', async () => {
    const dataset: unknown = JSON.parse(readFileSync(
      new URL('../../../public/data/community-waypoints.geojson', import.meta.url),
      'utf8',
    ))

    await expect(loadCommunityWaypoints(
      new AbortController().signal,
      createFetcher(dataset),
    )).resolves.toEqual([])
  })
})
