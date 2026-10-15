import { describe, expect, it } from 'vitest'
import { validateTransitNetwork } from '@navus/shared/transit/model'
import type { BusRouteGeometry } from '@navus/shared/transit/types'
import { createValidTransitNetwork } from './test-fixtures'
import {
  generateShuttleTimingData,
  validateShuttleTimingData,
} from '@navus/shared/transit/timing'

function createTimingNetwork() {
  const input = createValidTransitNetwork()
  input.routes[0].stopIds = ['STOP-A', 'STOP-B', 'STOP-C']
  input.stops[1].latitude = 1.001
  input.stops[1].longitude = 103
  input.stops.push({
    id: 'STOP-C',
    longName: 'Stop C',
    shortName: 'C',
    latitude: 1.002,
    longitude: 103,
    services: ['A1'],
  })
  return validateTransitNetwork(input)
}

function createTimingGeometry(): BusRouteGeometry {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { routeId: 'A1', name: 'A1', color: '#123456' },
      geometry: {
        type: 'LineString',
        coordinates: [[103, 1], [103, 1.001], [103, 1.002]],
      },
    }],
  }
}

describe('bus timing', () => {
  it('generates directed geometry-based estimates with uncertainty bounds', () => {
    const network = createTimingNetwork()
    const geometry = createTimingGeometry()
    const data = generateShuttleTimingData(network, geometry, '2026-09-22')

    expect(data.metadata).toMatchObject({
      generatedAt: '2026-09-22',
      method: 'geometry-effective-speed',
      geometryVerifiedAt: '2026-09-17',
      waitingPolicy: 'unavailable-without-verified-headway',
    })
    expect(data.records).toHaveLength(3)
    expect(data.records[0]).toMatchObject({
      routeId: 'A1',
      fromStopId: 'STOP-A',
      toStopId: 'STOP-B',
      status: 'estimated',
      waitingSeconds: null,
    })
    const firstRecord = data.records[0]
    if (
      firstRecord.rideSeconds === null ||
      firstRecord.rideSecondsLowerBound === null ||
      firstRecord.rideSecondsUpperBound === null
    ) throw new Error('Expected an estimated timing record')
    expect(firstRecord.rideSecondsLowerBound).toBeLessThanOrEqual(firstRecord.rideSeconds)
    expect(firstRecord.rideSeconds).toBeLessThanOrEqual(firstRecord.rideSecondsUpperBound)
    expect(data.records.some((record) => (
      record.fromStopId === 'STOP-B' && record.toStopId === 'STOP-A'
    ))).toBe(false)
    expect(validateShuttleTimingData(data, network)).toEqual(data)
  })

  it('rejects timing data with missing directed pairs', () => {
    const network = createTimingNetwork()
    const geometry = createTimingGeometry()
    const data = generateShuttleTimingData(network, geometry, '2026-09-22')
    const incomplete = { ...data, records: data.records.slice(1) }

    expect(() => validateShuttleTimingData(incomplete, network))
      .toThrow('missing timing record for A1:STOP-A->STOP-B')
  })

  it('generates the closing directed pair for a loop without a self-pair', () => {
    const input = createValidTransitNetwork()
    input.routes[0].stopIds = ['STOP-A', 'STOP-B', 'STOP-A']
    input.stops[1].latitude = 1.001
    input.stops[1].longitude = 103
    const network = validateTransitNetwork(input)
    const geometry: BusRouteGeometry = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { routeId: 'A1', name: 'A1', color: '#123456' },
        geometry: {
          type: 'LineString',
          coordinates: [[103, 1], [103, 1.001], [103, 1]],
        },
      }],
    }

    const data = generateShuttleTimingData(network, geometry, '2026-09-22')

    expect(data.records.map((record) => `${record.fromStopId}->${record.toStopId}`)).toEqual([
      'STOP-A->STOP-B',
      'STOP-B->STOP-A',
    ])
    expect(data.records.some((record) => record.fromStopId === record.toStopId)).toBe(false)
    expect(validateShuttleTimingData(data, network)).toEqual(data)
  })

  it('rejects stale geometry provenance and route-stop mismatches', () => {
    const network = createTimingNetwork()
    const geometry = createTimingGeometry()
    const data = generateShuttleTimingData(network, geometry, '2026-09-22')

    expect(() => validateShuttleTimingData({
      ...data,
      metadata: { ...data.metadata, geometryVerifiedAt: '2026-09-16' },
    }, network)).toThrow('geometry verification date does not match the transit network')

    expect(() => validateShuttleTimingData({
      ...data,
      records: [{ ...data.records[0], toStopId: 'STOP-C' }, ...data.records.slice(1)],
    }, network)).toThrow('duplicate timing record for A1:STOP-A->STOP-C')

    expect(() => validateShuttleTimingData({
      ...data,
      records: [{ ...data.records[0], fromStopId: 'STOP-B', toStopId: 'STOP-A' }, ...data.records.slice(1)],
    }, network)).toThrow('not in the verified direction')
  })
})
