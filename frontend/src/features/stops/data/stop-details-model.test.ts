import { describe, expect, it } from 'vitest'
import { createTransitIndex } from '../../../domain/transit'
import type { ShuttleArrivalSnapshot } from '../../../domain/transit/arrivals'
import type { PublicBusArrivalSnapshot } from '../../../domain/transit/public-bus-arrivals'
import type { ShuttleServiceWindow } from '../../../domain/transit/service-hours'
import { createValidTransitNetwork } from '../../../domain/transit/test-fixtures'
import { getStopDetailsModel } from './stop-details-model'
import type { StopDetailsModel } from './stop-details-model'
import type { StopsServiceWindows } from './stop-timing-data'

function getSelectedStop(
  stop: Parameters<typeof getStopDetailsModel>[0],
  index: Parameters<typeof getStopDetailsModel>[1],
  favoriteStopIds: readonly string[],
  arrivalSnapshot: ShuttleArrivalSnapshot | null,
  nowMs: number,
  serviceWindows: StopsServiceWindows | null = null,
  isRefreshing = false,
  publicArrivalSnapshot: PublicBusArrivalSnapshot | null = null,
  publicIsRefreshing = false,
): StopDetailsModel {
  return getStopDetailsModel(stop, index, {
    favoriteStopIds,
    arrivalSnapshot,
    nowMs,
    serviceWindows,
    isRefreshing,
    publicArrivalSnapshot,
    publicIsRefreshing,
  })
}

describe('selected stop details model', () => {
  it('maps a fresh arrival snapshot to canonical route departures and adjusts for snapshot age', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 30,
            upcomingArrivalSeconds: [30, 330, 930],
            headwaySeconds: { min: 300, median: 300, max: 300 },
          },
        },
      },
    }

    const selection = getSelectedStop(
      index.stopById.get('STOP-A')!,
      index,
      [],
      snapshot,
      Date.parse('2026-09-30T00:00:20.000Z'),
    )

    expect(selection.departures.map(({ routeId }) => routeId)).toEqual(['A1'])
    expect(selection.departures[0]?.timings).toEqual(['Arr', '6m', '16m'])
    expect(selection.live).toBe(true)
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('maps LTA public arrivals into the same timing tuple used by internal buses', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: PublicBusArrivalSnapshot = {
      source: 'lta-datamall',
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      refreshedAt: '2026-09-30T00:00:00.000Z',
      stops: {
        'STOP-A': {
          observedAt: '2026-09-30T00:00:00.000Z',
          expiresAt: '2026-09-30T00:01:00.000Z',
          services: {
            '95': {
              status: 'live',
              arrivals: [
                { estimatedAt: '2026-09-30T00:00:30.000Z', monitored: true },
                { estimatedAt: '2026-09-30T00:05:00.000Z', monitored: true },
              ],
            },
          },
        },
      },
    }

    const selection = getSelectedStop(
      index.stopById.get('STOP-A')!,
      index,
      [],
      null,
      Date.parse('2026-09-30T00:00:00.000Z'),
      null,
      false,
      snapshot,
    )

    expect(selection.publicServices).toEqual([{
      serviceNumber: '95',
      timings: ['1m', '5m', '-'],
      status: 'live',
    }])
    expect(selection.live).toBe(true)
  })

  it('uses each stop observation clock for its displayed arrivals', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      stopObservations: {
        'STOP-A': {
          observedAt: '2026-09-30T00:00:00.000Z',
          expiresAt: '2026-09-30T00:01:00.000Z',
        },
        'STOP-B': {
          observedAt: '2026-09-30T00:00:10.000Z',
          expiresAt: '2026-09-30T00:01:00.000Z',
        },
      },
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 71,
            upcomingArrivalSeconds: [71, 131],
            headwaySeconds: { min: 60, median: 60, max: 60 },
          },
        },
        'STOP-B': {
          A1: {
            nextArrivalSeconds: 71,
            upcomingArrivalSeconds: [71, 131],
            headwaySeconds: { min: 60, median: 60, max: 60 },
          },
        },
      },
    }

    const nowMs = Date.parse('2026-09-30T00:00:20.000Z')
    const stopA = getSelectedStop(index.stopById.get('STOP-A')!, index, [], snapshot, nowMs)
    const stopB = getSelectedStop(index.stopById.get('STOP-B')!, index, [], snapshot, nowMs)

    expect(stopA.departures[0]?.timings).toEqual(['1m', '2m', '-'])
    expect(stopB.departures[0]?.timings).toEqual(['2m', '3m', '-'])
  })

  it('keeps slightly stale arrivals during the refresh grace period', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 300,
            upcomingArrivalSeconds: [300, 600],
            headwaySeconds: { min: 300, median: 300, max: 300 },
          },
        },
      },
    }

    const selection = getSelectedStop(
      index.stopById.get('STOP-A')!,
      index,
      [],
      snapshot,
      Date.parse('2026-09-30T00:00:31.000Z'),
    )

    expect(selection.departures[0]?.timings).toEqual(['5m', '10m', '-'])
    expect(selection.live).toBe(false)
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('removes arrivals after the maximum stale boundary', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 300,
            upcomingArrivalSeconds: [300, 600],
            headwaySeconds: { min: 300, median: 300, max: 300 },
          },
        },
      },
    }

    const selection = getSelectedStop(
      index.stopById.get('STOP-A')!,
      index,
      [],
      snapshot,
      Date.parse('2026-09-30T00:02:01.000Z'),
    )

    expect(selection.departures).toEqual([])
    expect(selection.live).toBe(false)
    expect(selection.liveArrivalMessage).toBe('No live data')
  })

  it('shows a scheduled first-bus estimate within the 30-minute grace period', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const emptySnapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-29T16:00:00.000Z',
      expiresAt: '2026-09-29T16:01:00.000Z',
      stops: { 'STOP-A': {} },
    }
    const serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> = {
      A1: [{ routeId: 'A1', firstTime: '00:06', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
    }

    const selection = getSelectedStop(
      index.stopById.get('STOP-A')!,
      index,
      [],
      emptySnapshot,
      Date.parse('2026-09-29T16:00:00.000Z'),
      serviceWindows,
    )

    expect(selection.departures).toEqual([])
    expect(selection.live).toBe(false)
    expect(selection.scheduledDepartures).toEqual([{
      routeId: 'A1',
      routeName: 'A1',
      routeColor: '#123456',
      message: 'First bus in 6m',
    }])
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('does not treat a long pre-service arrival as live timing', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-29T16:00:00.000Z',
      expiresAt: '2026-09-29T16:01:00.000Z',
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 19_680,
            upcomingArrivalSeconds: [19_680, 20_100, 20_520],
            headwaySeconds: { min: 420, median: 420, max: 420 },
          },
        },
      },
    }
    const serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> = {
      A1: [{ routeId: 'A1', firstTime: '06:00', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
    }

    const selection = getSelectedStop(
      index.stopById.get('STOP-A')!,
      index,
      [],
      snapshot,
      Date.parse('2026-09-29T16:00:00.000Z'),
      serviceWindows,
    )

    expect(selection.departures).toEqual([])
    expect(selection.live).toBe(false)
    expect(selection.scheduledDepartures.map(({ routeId, message }) => ({ routeId, message }))).toEqual([
      { routeId: 'A1', message: 'Starts 6:00 AM' },
    ])
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('keeps old rows during a refresh without marking them live or stale', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const snapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      stops: {
        'STOP-A': {
          A1: {
            nextArrivalSeconds: 300,
            upcomingArrivalSeconds: [300, 600],
            headwaySeconds: null,
          },
        },
      },
    }
    const serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> = {
      A1: [{ routeId: 'A1', firstTime: '00:00', lastTime: '23:59', dayType: 'Mon-Fri', dates: [] }],
    }

    const selection = getSelectedStop(
      index.stopById.get('STOP-A')!,
      index,
      [],
      snapshot,
      Date.parse('2026-09-30T00:00:31.000Z'),
      serviceWindows,
      true,
    )

    expect(selection.departures[0]?.timings).toEqual(['5m', '10m', '-'])
    expect(selection.live).toBe(false)
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('uses compact service text when the next start is outside the grace period', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const emptySnapshot: ShuttleArrivalSnapshot = {
      observedAt: '2026-09-29T16:00:00.000Z',
      expiresAt: '2026-09-29T16:01:00.000Z',
      stops: { 'STOP-A': {} },
    }
    const serviceWindows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> = {
      A1: [{ routeId: 'A1', firstTime: '01:00', lastTime: '23:00', dayType: 'Mon-Fri', dates: [] }],
    }

    const selection = getSelectedStop(
      index.stopById.get('STOP-A')!,
      index,
      [],
      emptySnapshot,
      Date.parse('2026-09-29T16:00:00.000Z'),
      serviceWindows,
    )

    expect(selection.scheduledDepartures.map(({ routeId, message }) => ({ routeId, message }))).toEqual([
      { routeId: 'A1', message: 'Starts 1:00 AM' },
    ])
    expect(selection.liveArrivalMessage).toBeNull()
  })

  it('adds downstream favourite stop nicknames to matching route departures', () => {
    const network = createValidTransitNetwork()
    network.routes[0].stopIds = ['STOP-A', 'STOP-B', 'STOP-C', 'STOP-A']
    network.stops.push({
      id: 'STOP-C',
      longName: 'Stop C',
      shortName: 'C',
      latitude: 1.2,
      longitude: 103.2,
      services: ['A1'],
      opposite: null,
    })
    const index = createTransitIndex(network)

    const selection = getSelectedStop(
      index.stopById.get('STOP-A')!,
      index,
      ['STOP-C'],
      {
        observedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-09-30T00:01:00.000Z',
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 300,
              upcomingArrivalSeconds: [300],
              headwaySeconds: null,
            },
          },
        },
      },
      Date.parse('2026-09-30T00:00:00.000Z'),
    )

    expect(selection.departures[0]?.reachableFavouriteStops).toEqual([
      { id: 'STOP-C', name: 'C', isOpposite: false },
    ])
  })

  it('marks a reachable favourite as opposite when the route reaches the selected stop opposite', () => {
    const network = createValidTransitNetwork()
    network.routes[0].stopIds = ['STOP-A', 'STOP-B', 'STOP-C', 'STOP-A']
    network.stops.push({
      id: 'STOP-C',
      longName: 'Stop C',
      shortName: 'C',
      latitude: 1.2,
      longitude: 103.2,
      services: ['A1'],
      opposite: null,
    })
    const index = createTransitIndex(network)

    const selection = getSelectedStop(
      index.stopById.get('STOP-A')!,
      index,
      ['STOP-B', 'STOP-C'],
      {
        observedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-09-30T00:01:00.000Z',
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 300,
              upcomingArrivalSeconds: [300],
              headwaySeconds: null,
            },
          },
        },
      },
      Date.parse('2026-09-30T00:00:00.000Z'),
    )

    expect(selection.departures[0]?.reachableFavouriteStops).toEqual([
      { id: 'STOP-B', name: 'B', isOpposite: true },
      { id: 'STOP-C', name: 'C', isOpposite: false },
    ])
  })
})
