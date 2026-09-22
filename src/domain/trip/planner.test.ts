import { describe, expect, it } from 'vitest'
import { createTransitNetworkIndex } from '../transit'
import { validateTransitRouteGeometry } from '../transit/geometry'
import { generateShuttleTimingData } from '../transit/timing'
import { validateTransitNetwork } from '../transit/model'
import type { TripEndpoint } from './types'
import {
  planJourney,
  zeroShuttleWaitingTime,
  type PlanJourneyInput,
  type WalkingJourneyConnection,
} from './planner'

const origin: TripEndpoint = { kind: 'venue', id: 'ORIGIN' }
const destination: TripEndpoint = { kind: 'venue', id: 'DESTINATION' }
const stopA: TripEndpoint = { kind: 'stop', id: 'STOP-A' }
const stopB: TripEndpoint = { kind: 'stop', id: 'STOP-B' }

function lineGeometry(from: TripEndpoint, to: TripEndpoint): WalkingJourneyConnection['geometry'] {
  const coordinateByEndpoint = new Map([
    [`venue:ORIGIN`, [102.999, 1] as const],
    [`stop:STOP-A`, [103, 1] as const],
    [`stop:STOP-B`, [103.001, 1] as const],
    [`venue:DESTINATION`, [103.002, 1] as const],
  ])
  return {
    type: 'LineString',
    coordinates: [coordinateByEndpoint.get(`${from.kind}:${from.id}`)!, coordinateByEndpoint.get(`${to.kind}:${to.id}`)!],
  }
}

function walking(
  from: TripEndpoint,
  to: TripEndpoint,
  durationSeconds: number,
  distanceMeters = durationSeconds,
): WalkingJourneyConnection {
  return {
    from,
    to,
    durationSeconds,
    distanceMeters,
    geometry: lineGeometry(from, to),
  }
}

function createInput(
  walkingConnections: readonly WalkingJourneyConnection[],
  getShuttleWaitingSeconds = zeroShuttleWaitingTime,
): PlanJourneyInput {
  const network = validateTransitNetwork({
    version: 1,
    metadata: {
      source: 'test',
      routeStopOrder: 'test',
      routeGeometry: 'test',
      verifiedAt: '2026-09-22',
      routeOrderSource: 'test',
      coordinateSource: 'test',
    },
    routes: [{ id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A', 'STOP-B'] }],
    stops: [
      { id: 'STOP-A', longName: 'Stop A', shortName: 'A', latitude: 1, longitude: 103, services: ['A1'] },
      { id: 'STOP-B', longName: 'Stop B', shortName: 'B', latitude: 1, longitude: 103.001, services: ['A1'] },
    ],
  })
  const routeGeometry = validateTransitRouteGeometry(network, {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { routeId: 'A1', name: 'A1', color: '#123456' },
      geometry: { type: 'LineString', coordinates: [[103, 1], [103.001, 1]] },
    }],
  })

  return {
    origin: { endpoint: origin, coordinate: { longitude: 102.999, latitude: 1 } },
    destination: { endpoint: destination, coordinate: { longitude: 103.002, latitude: 1 } },
    transitIndex: createTransitNetworkIndex(network),
    routeGeometry,
    shuttleTiming: generateShuttleTimingData(network, routeGeometry, '2026-09-22'),
    walkingConnections,
    getShuttleWaitingSeconds,
  }
}

describe('planJourney', () => {
  it('includes a directed shuttle leg when zero waiting makes it the best journey', () => {
    const journey = planJourney(createInput([
      walking(origin, stopA, 100),
      walking(stopB, destination, 100),
      walking(origin, destination, 500),
    ]))

    expect(journey).not.toBeNull()
    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking', 'shuttle', 'walking'])
    expect(journey?.legs[1]).toMatchObject({
      routeId: 'A1',
      boardingStopId: 'STOP-A',
      alightingStopId: 'STOP-B',
      waitingSeconds: 0,
    })
    expect(journey?.totalDurationSeconds).toBeLessThan(500)
    expect(journey?.estimateStatus).toBe('estimated')
  })

  it('uses the waiting-time seam without changing the planner', () => {
    const journey = planJourney(createInput([
      walking(origin, stopA, 100),
      walking(stopB, destination, 100),
      walking(origin, destination, 500),
    ], () => 1_000))

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking'])
    expect(journey?.totalDurationSeconds).toBe(500)
  })

  it('keeps shuttle movement directed and falls back to walking', () => {
    const journey = planJourney(createInput([
      walking(origin, stopB, 100),
      walking(stopA, destination, 100),
      walking(origin, destination, 500),
    ]))

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking'])
    expect(journey?.totalDurationSeconds).toBe(500)
  })

  it('plans the closing leg of a one-way loop', () => {
    const network = validateTransitNetwork({
      version: 1,
      metadata: {
        source: 'test',
        routeStopOrder: 'test',
        routeGeometry: 'test',
        verifiedAt: '2026-09-22',
        routeOrderSource: 'test',
        coordinateSource: 'test',
      },
      routes: [{ id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A', 'STOP-B', 'STOP-A'] }],
      stops: [
        { id: 'STOP-A', longName: 'Stop A', shortName: 'A', latitude: 1, longitude: 103, services: ['A1'] },
        { id: 'STOP-B', longName: 'Stop B', shortName: 'B', latitude: 1.001, longitude: 103, services: ['A1'] },
      ],
    })
    const routeGeometry = validateTransitRouteGeometry(network, {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { routeId: 'A1', name: 'A1', color: '#123456' },
        geometry: { type: 'LineString', coordinates: [[103, 1], [103, 1.001], [103, 1]] },
      }],
    })
    const journey = planJourney({
      origin: { endpoint: stopB, coordinate: { longitude: 103, latitude: 1.001 } },
      destination: { endpoint: stopA, coordinate: { longitude: 103, latitude: 1 } },
      transitIndex: createTransitNetworkIndex(network),
      routeGeometry,
      shuttleTiming: generateShuttleTimingData(network, routeGeometry, '2026-09-22'),
      walkingConnections: [],
      getShuttleWaitingSeconds: zeroShuttleWaitingTime,
    })

    expect(journey?.legs).toHaveLength(1)
    expect(journey?.legs[0]).toMatchObject({
      mode: 'shuttle',
      routeId: 'A1',
      boardingStopId: 'STOP-B',
      alightingStopId: 'STOP-A',
    })
  })

  it('returns no journey when no complete connection exists', () => {
    expect(planJourney(createInput([]))).toBeNull()
  })
})
