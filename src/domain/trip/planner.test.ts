import { describe, expect, it } from 'vitest'
import { createTransitNetworkIndex } from '../transit'
import { validateTransitRouteGeometry } from '../transit/geometry'
import { generateShuttleTimingData } from '../transit/timing'
import { validateTransitNetwork } from '../transit/model'
import type { TripEndpoint } from './types'
import {
  planJourney,
  planJourneyWithinBudget,
  zeroShuttleWaitingTime,
  type PlanJourneyInput,
  type WalkingJourneyConnection,
} from './planner'

const origin: TripEndpoint = { kind: 'venue', id: 'ORIGIN' }
const destination: TripEndpoint = { kind: 'venue', id: 'DESTINATION' }
const stopA: TripEndpoint = { kind: 'stop', id: 'STOP-A' }
const stopB: TripEndpoint = { kind: 'stop', id: 'STOP-B' }
const stopC: TripEndpoint = { kind: 'stop', id: 'STOP-C' }
const stopE: TripEndpoint = { kind: 'stop', id: 'STOP-E' }

function lineGeometry(from: TripEndpoint, to: TripEndpoint): WalkingJourneyConnection['geometry'] {
  const coordinateByEndpoint = new Map([
    [`venue:ORIGIN`, [102.999, 1] as const],
    [`stop:STOP-A`, [103, 1] as const],
    [`stop:STOP-B`, [103.001, 1] as const],
    [`stop:STOP-C`, [103.002, 1] as const],
    [`stop:STOP-D`, [103.003, 1] as const],
    [`stop:STOP-E`, [103.004, 1] as const],
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

function createUpstreamBoardingInput(): PlanJourneyInput {
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
  const originStop: TripEndpoint = { kind: 'stop', id: 'STOP-B' }
  return {
    origin: { endpoint: originStop, coordinate: { longitude: 103.001, latitude: 1 } },
    destination: { endpoint: destination, coordinate: { longitude: 103.003, latitude: 1 } },
    transitIndex: createTransitNetworkIndex(network),
    routeGeometry,
    shuttleTiming: generateShuttleTimingData(network, routeGeometry, '2026-09-22'),
    walkingConnections: [
      walking(originStop, stopA, 10),
      walking(stopC, destination, 10),
      walking(originStop, destination, 1_000),
    ],
    getShuttleWaitingSeconds: (record) => record.fromStopId === 'STOP-A' ? 0 : 100,
  }
}

function createTerminalReboardingInput(): PlanJourneyInput {
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
    routes: [{ id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A', 'STOP-B', 'STOP-C', 'STOP-A'] }],
    stops: [
      { id: 'STOP-A', longName: 'Stop A', shortName: 'A', latitude: 1, longitude: 103, services: ['A1'] },
      { id: 'STOP-B', longName: 'Stop B', shortName: 'B', latitude: 1.001, longitude: 103, services: ['A1'] },
      { id: 'STOP-C', longName: 'Stop C', shortName: 'C', latitude: 1.002, longitude: 103, services: ['A1'] },
    ],
  })
  const routeGeometry = validateTransitRouteGeometry(network, {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { routeId: 'A1', name: 'A1', color: '#123456' },
      geometry: { type: 'LineString', coordinates: [[103, 1], [103, 1.001], [103, 1.002], [103, 1]] },
    }],
  })
  return {
    origin: { endpoint: origin, coordinate: { longitude: 102.999, latitude: 1 } },
    destination: { endpoint: destination, coordinate: { longitude: 103.002, latitude: 1.003 } },
    transitIndex: createTransitNetworkIndex(network),
    routeGeometry,
    shuttleTiming: generateShuttleTimingData(network, routeGeometry, '2026-09-22'),
    walkingConnections: [
      walking(origin, stopB, 10),
      walking(stopC, destination, 10),
      walking(origin, destination, 1_000),
    ],
    getShuttleWaitingSeconds: (record) => (
      record.fromStopId === 'STOP-B' && record.toStopId === 'STOP-C' ? null : 5
    ),
  }
}

function createTimeDependentInput(): PlanJourneyInput {
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
      { id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A', 'STOP-C', 'STOP-D'] },
      { id: 'B1', name: 'B1', color: '#234567', stopIds: ['STOP-D', 'STOP-E'] },
    ],
    stops: [
      { id: 'STOP-A', longName: 'Stop A', shortName: 'A', latitude: 1, longitude: 103, services: ['A1'] },
      { id: 'STOP-C', longName: 'Stop C', shortName: 'C', latitude: 1, longitude: 103.002, services: ['A1'] },
      { id: 'STOP-D', longName: 'Stop D', shortName: 'D', latitude: 1, longitude: 103.003, services: ['A1', 'B1'] },
      { id: 'STOP-E', longName: 'Stop E', shortName: 'E', latitude: 1, longitude: 103.004, services: ['B1'] },
    ],
  })
  const routeGeometry = validateTransitRouteGeometry(network, {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { routeId: 'A1', name: 'A1', color: '#123456' }, geometry: { type: 'LineString', coordinates: [[103, 1], [103.002, 1], [103.003, 1]] } },
      { type: 'Feature', properties: { routeId: 'B1', name: 'B1', color: '#234567' }, geometry: { type: 'LineString', coordinates: [[103.003, 1], [103.004, 1]] } },
    ],
  })
  return {
    origin: { endpoint: origin, coordinate: { longitude: 102.999, latitude: 1 } },
    destination: { endpoint: destination, coordinate: { longitude: 103.005, latitude: 1 } },
    transitIndex: createTransitNetworkIndex(network),
    routeGeometry,
    shuttleTiming: generateShuttleTimingData(network, routeGeometry, '2026-09-22'),
    walkingConnections: [
      walking(origin, stopA, 1),
      walking(origin, stopC, 100),
      walking(stopE, destination, 1),
      walking(origin, destination, 1_000),
    ],
    getShuttleWaitingSeconds: (record, context) => (
      record.routeId === 'B1' && context.elapsedSeconds < 100 ? 100 : 0
    ),
  }
}

function createLabelOverflowInput(): PlanJourneyInput {
  const branchStopIds = Array.from({ length: 9 }, (_, index) => `STOP-P${index + 1}`)
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
    routes: [{ id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-X', 'STOP-Y'] }],
    stops: [
      ...branchStopIds.map((id) => ({
        id,
        longName: id,
        shortName: id,
        latitude: 1,
        longitude: 103,
        services: ['PUB:WALKING'],
      })),
      { id: 'STOP-X', longName: 'Stop X', shortName: 'X', latitude: 1, longitude: 103, services: ['A1'] },
      { id: 'STOP-Y', longName: 'Stop Y', shortName: 'Y', latitude: 1, longitude: 103.001, services: ['A1'] },
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
  const genericGeometry: WalkingJourneyConnection['geometry'] = {
    type: 'LineString',
    coordinates: [[103, 1], [103.001, 1]],
  }

  return {
    origin: { endpoint: origin, coordinate: { longitude: 102.999, latitude: 1 } },
    destination: { endpoint: destination, coordinate: { longitude: 103.002, latitude: 1 } },
    transitIndex: createTransitNetworkIndex(network),
    routeGeometry,
    shuttleTiming: generateShuttleTimingData(network, routeGeometry, '2026-09-22'),
    walkingConnections: [
      ...branchStopIds.flatMap((id, index) => [
        { from: origin, to: { kind: 'stop', id } as TripEndpoint, durationSeconds: 0, distanceMeters: 0, geometry: genericGeometry },
        { from: { kind: 'stop', id } as TripEndpoint, to: { kind: 'stop', id: 'STOP-X' } as TripEndpoint, durationSeconds: index + 1, distanceMeters: index + 1, geometry: genericGeometry },
      ]),
      { from: { kind: 'stop', id: 'STOP-Y' } as TripEndpoint, to: destination, durationSeconds: 1, distanceMeters: 1, geometry: genericGeometry },
      { from: origin, to: destination, durationSeconds: 1_000, distanceMeters: 1_000, geometry: genericGeometry },
    ],
    getShuttleWaitingSeconds: (_record, context) => context.elapsedSeconds === 5 ? 0 : null,
  }
}

function createCompleteAlternativeInput(): PlanJourneyInput {
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
      { id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A', 'STOP-C'] },
      { id: 'B1', name: 'B1', color: '#234567', stopIds: ['STOP-B', 'STOP-C'] },
    ],
    stops: [
      { id: 'STOP-A', longName: 'Stop A', shortName: 'A', latitude: 1, longitude: 103, services: ['A1'] },
      { id: 'STOP-B', longName: 'Stop B', shortName: 'B', latitude: 1, longitude: 103.001, services: ['B1'] },
      { id: 'STOP-C', longName: 'Stop C', shortName: 'C', latitude: 1, longitude: 103.002, services: ['A1', 'B1'] },
    ],
  })
  const routeGeometry = validateTransitRouteGeometry(network, {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { routeId: 'A1', name: 'A1', color: '#123456' }, geometry: { type: 'LineString', coordinates: [[103, 1], [103.002, 1]] } },
      { type: 'Feature', properties: { routeId: 'B1', name: 'B1', color: '#234567' }, geometry: { type: 'LineString', coordinates: [[103.001, 1], [103.002, 1]] } },
    ],
  })
  const genericGeometry: WalkingJourneyConnection['geometry'] = {
    type: 'LineString',
    coordinates: [[103, 1], [103.001, 1]],
  }

  return {
    origin: { endpoint: origin, coordinate: { longitude: 102.999, latitude: 1 } },
    destination: { endpoint: destination, coordinate: { longitude: 103.003, latitude: 1 } },
    transitIndex: createTransitNetworkIndex(network),
    routeGeometry,
    shuttleTiming: generateShuttleTimingData(network, routeGeometry, '2026-09-22'),
    walkingConnections: [
      { from: origin, to: stopA, durationSeconds: 1, distanceMeters: 1, geometry: genericGeometry },
      { from: origin, to: { kind: 'stop', id: 'STOP-B' }, durationSeconds: 10, distanceMeters: 10, geometry: genericGeometry },
      { from: { kind: 'stop', id: 'STOP-C' }, to: destination, durationSeconds: 1, distanceMeters: 1, geometry: genericGeometry },
      { from: origin, to: destination, durationSeconds: 1_000, distanceMeters: 1_000, geometry: genericGeometry },
    ],
    getShuttleWaitingSeconds: (record) => record.routeId === 'A1' ? null : 0,
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

  it('uses the direct walking connection instead of composing endpoint connectors', () => {
    const journey = planJourney(createInput([
      walking(origin, stopA, 100, 120),
      walking(stopA, destination, 200, 240),
      walking(origin, destination, 500, 600),
    ]))

    expect(journey?.legs).toHaveLength(1)
    expect(journey?.legs[0]).toMatchObject({
      mode: 'walking',
      from: origin,
      to: destination,
      durationSeconds: 500,
      distanceMeters: 600,
      geometry: {
        type: 'LineString',
        coordinates: [
          [102.999, 1],
          [103.002, 1],
        ],
      },
    })
    expect(journey?.totalDurationSeconds).toBe(500)
    expect(journey?.totalDistanceMeters).toBe(600)
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

  it('keeps a selected stop fixed instead of walking to another boarding stop', () => {
    const journey = planJourney(createUpstreamBoardingInput())

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['shuttle', 'walking'])
    expect(journey?.legs[0]).toMatchObject({
      routeId: 'A1',
      boardingStopId: 'STOP-B',
      alightingStopId: 'STOP-C',
    })
  })

  it('does not reboard after a route reaches its declared terminal', () => {
    const journey = planJourney(createTerminalReboardingInput())

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking'])
    expect(journey?.totalDurationSeconds).toBe(1_000)
  })

  it('uses direct walking when only a two-shuttle route could reach the destination', () => {
    const journey = planJourney(createTimeDependentInput())

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking'])
    expect(journey?.totalDurationSeconds).toBe(1_000)
  })

  it('does not treat stop-to-stop walking as a path into the shuttle network', () => {
    const journey = planJourney(createLabelOverflowInput())

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking'])
    expect(journey?.totalDurationSeconds).toBe(1_000)
  })

  it('does not use a walking cycle to manufacture a later shuttle opportunity', () => {
    const journey = planJourney(createInput([
      walking(origin, stopA, 0),
      walking(stopA, origin, 1),
      walking(stopB, destination, 1),
    ], (_record, context) => context.elapsedSeconds === 1 ? 0 : null))

    expect(journey).toBeNull()
  })

  it('chooses a slower complete route when a faster option is unavailable', () => {
    const journey = planJourney(createCompleteAlternativeInput())

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking', 'shuttle', 'walking'])
    expect(journey?.legs[1]).toMatchObject({ routeId: 'B1', boardingStopId: 'STOP-B' })
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

  it('falls back to direct walking when reaching the destination needs two transfers', () => {
    const journey = planJourney(createTwoTransferInput(() => 25))

    expect(journey?.legs.map((leg) => leg.mode)).toEqual(['walking'])
    expect(journey?.totalDurationSeconds).toBe(1_000)
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

  it('returns an exact result when the bounded search finishes', async () => {
    const result = await planJourneyWithinBudget(createInput([
      walking(origin, stopA, 100),
      walking(stopB, destination, 100),
      walking(origin, destination, 500),
    ]), { maxExpandedPaths: 10_000 })

    expect(result.status).toBe('complete')
    expect(result.journey?.planningQuality).toBe('exact')
    expect(result.journey?.totalDurationSeconds).toBeLessThan(500)
  })

  it('returns the best complete result when the search budget is reached', async () => {
    const input = createInput([
      walking(origin, stopA, 1),
      walking(stopB, destination, 1),
    ])
    const rideSeconds = input.shuttleTiming.records.find((record) => (
      record.routeId === 'A1' &&
      record.fromStopId === 'STOP-A' &&
      record.toStopId === 'STOP-B'
    ))?.rideSeconds
    if (rideSeconds === null || rideSeconds === undefined) {
      throw new Error('Expected a generated A1 ride estimate')
    }

    const result = await planJourneyWithinBudget({
      ...input,
      walkingConnections: [
        ...input.walkingConnections,
        walking(origin, destination, rideSeconds + 2),
      ],
    }, { maxExpandedPaths: 1 })

    expect(result.status).toBe('budget-exceeded')
    expect(result.journey?.planningQuality).toBe('bounded')
    expect(result.journey?.totalDurationSeconds).toBe(rideSeconds + 2)
  })

  it('stops before expanding a path when cancelled', async () => {
    const result = await planJourneyWithinBudget(createInput([
      walking(origin, destination, 100),
    ]), { shouldCancel: () => true })

    expect(result.status).toBe('cancelled')
    expect(result.expandedPathCount).toBe(0)
    expect(result.journey).toBeNull()
  })
})
