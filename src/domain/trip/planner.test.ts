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
    [`stop:STOP-C`, [103.002, 1] as const],
    [`stop:STOP-D`, [103.003, 1] as const],
    [`venue:DESTINATION`, [103.002, 1] as const],
  ])
  return {
    type: 'LineString',
    coordinates: [coordinateByEndpoint.get(`${from.kind}:${from.id}`)!, coordinateByEndpoint.get(`${to.kind}:${to.id}`)!],
  }
}

function createTwoTransferInput(
  getShuttleWaitingSeconds: PlanJourneyInput['getShuttleWaitingSeconds'],
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
    routes: [
      { id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A', 'STOP-B'] },
      { id: 'B1', name: 'B1', color: '#234567', stopIds: ['STOP-B', 'STOP-C'] },
      { id: 'C1', name: 'C1', color: '#345678', stopIds: ['STOP-C', 'STOP-D'] },
    ],
    stops: [
      { id: 'STOP-A', longName: 'Stop A', shortName: 'A', latitude: 1, longitude: 103, services: ['A1'] },
      { id: 'STOP-B', longName: 'Stop B', shortName: 'B', latitude: 1, longitude: 103.001, services: ['A1', 'B1'] },
      { id: 'STOP-C', longName: 'Stop C', shortName: 'C', latitude: 1, longitude: 103.002, services: ['B1', 'C1'] },
      { id: 'STOP-D', longName: 'Stop D', shortName: 'D', latitude: 1, longitude: 103.003, services: ['C1'] },
    ],
  })
  const geometry = validateTransitRouteGeometry(network, {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { routeId: 'A1', name: 'A1', color: '#123456' }, geometry: { type: 'LineString', coordinates: [[103, 1], [103.001, 1]] } },
      { type: 'Feature', properties: { routeId: 'B1', name: 'B1', color: '#234567' }, geometry: { type: 'LineString', coordinates: [[103.001, 1], [103.002, 1]] } },
      { type: 'Feature', properties: { routeId: 'C1', name: 'C1', color: '#345678' }, geometry: { type: 'LineString', coordinates: [[103.002, 1], [103.003, 1]] } },
    ],
  })
  return {
    origin: { endpoint: origin, coordinate: { longitude: 102.999, latitude: 1 } },
    destination: { endpoint: destination, coordinate: { longitude: 103.002, latitude: 1 } },
    transitIndex: createTransitNetworkIndex(network),
    routeGeometry: geometry,
    shuttleTiming: generateShuttleTimingData(network, geometry, '2026-09-22'),
    walkingConnections: [
      walking(origin, stopA, 100),
      walking({ kind: 'stop', id: 'STOP-D' }, destination, 100),
      walking(origin, destination, 1_000),
    ],
    getShuttleWaitingSeconds,
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

function createSameRouteInput(): PlanJourneyInput {
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
    routes: [{ id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A', 'STOP-B', 'STOP-C'] }],
    stops: [
      { id: 'STOP-A', longName: 'Stop A', shortName: 'A', latitude: 1, longitude: 103, services: ['A1'] },
      { id: 'STOP-B', longName: 'Stop B', shortName: 'B', latitude: 1, longitude: 103.001, services: ['A1'] },
      { id: 'STOP-C', longName: 'Stop C', shortName: 'C', latitude: 1, longitude: 103.002, services: ['A1'] },
    ],
  })
  const routeGeometry = validateTransitRouteGeometry(network, {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { routeId: 'A1', name: 'A1', color: '#123456' },
      geometry: { type: 'LineString', coordinates: [[103, 1], [103.001, 1], [103.002, 1]] },
    }],
  })

  return {
    origin: { endpoint: origin, coordinate: { longitude: 102.999, latitude: 1 } },
    destination: { endpoint: destination, coordinate: { longitude: 103.002, latitude: 1 } },
    transitIndex: createTransitNetworkIndex(network),
    routeGeometry,
    shuttleTiming: generateShuttleTimingData(network, routeGeometry, '2026-09-22'),
    walkingConnections: [
      walking(origin, stopA, 10),
      walking({ kind: 'stop', id: 'STOP-C' }, destination, 10),
      walking(origin, destination, 1_000),
    ],
    getShuttleWaitingSeconds: zeroShuttleWaitingTime,
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

  it('keeps a continuous same-route ride as one shuttle leg', () => {
    const journey = planJourney(createSameRouteInput())

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking', 'shuttle', 'walking'])
    expect(journey?.legs.filter((leg) => leg.mode === 'shuttle')).toHaveLength(1)
    expect(journey?.legs[1]).toMatchObject({
      routeId: 'A1',
      boardingStopId: 'STOP-A',
      alightingStopId: 'STOP-C',
      waitingSeconds: 0,
    })
  })

  it('passes the elapsed journey time to each shuttle wait calculation', () => {
    const contexts: number[] = []
    const journey = planJourney(createInput([
      walking(origin, stopA, 100),
      walking(stopB, destination, 100),
      walking(origin, destination, 500),
    ], (_record, context) => {
      contexts.push(context.elapsedSeconds)
      return 10
    }))

    expect(journey?.legs[1]).toMatchObject({ waitingSeconds: 10 })
    expect(contexts).toContain(100)
  })

  it('charges a wait for all three boardings on a two-transfer Journey', () => {
    const journey = planJourney(createTwoTransferInput(() => 25))

    expect(journey?.legs.map((leg) => leg.mode)).toEqual([
      'walking',
      'shuttle',
      'shuttle',
      'shuttle',
      'walking',
    ])
    expect(journey?.legs.filter((leg) => leg.mode === 'shuttle'))
      .toHaveLength(3)
    expect(journey?.legs
      .filter((leg) => leg.mode === 'shuttle')
      .map((leg) => leg.waitingSeconds))
      .toEqual([25, 25, 25])
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
