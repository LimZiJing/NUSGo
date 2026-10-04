import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import type { Journey } from '../../domain/trip/journey'
import { getJourneyTimelineEntries } from './journey-result-presentation'
import { TripJourneyResult } from './trip-journey-result'

const networkIndex = createTransitIndex(createValidTransitNetwork())
const route = networkIndex.routes[0]
const boardingStopId = route.stopIds[0]
const alightingStopId = route.stopIds[2]

const journey: Journey = {
  origin: { kind: 'venue', id: 'ORIGIN' },
  destination: { kind: 'venue', id: 'DESTINATION' },
  legs: [
    {
      mode: 'walking',
      from: { kind: 'venue', id: 'ORIGIN' },
      to: { kind: 'stop', id: boardingStopId },
      durationSeconds: 90,
      distanceMeters: 120,
      geometry: { type: 'LineString', coordinates: [[103, 1], [103.01, 1.01]] },
    },
    {
      mode: 'shuttle',
      from: { kind: 'stop', id: boardingStopId },
      to: { kind: 'stop', id: alightingStopId },
      durationSeconds: 300,
      distanceMeters: 2200,
      geometry: { type: 'LineString', coordinates: [[103.01, 1.01], [103.1, 1.1]] },
      routeId: route.id,
      boardingStopId,
      alightingStopId,
      waitingSeconds: 0,
      rideSeconds: 300,
    },
    {
      mode: 'walking',
      from: { kind: 'stop', id: alightingStopId },
      to: { kind: 'venue', id: 'DESTINATION' },
      durationSeconds: 180,
      distanceMeters: 250,
      geometry: { type: 'LineString', coordinates: [[103.1, 1.1], [103.2, 1.2]] },
    },
  ],
  totalDurationSeconds: 570,
  totalDistanceMeters: 2570,
  estimateStatus: 'estimated',
  planningQuality: 'exact',
}

const venues = {
  ORIGIN: { roomName: 'Origin venue', location: { x: 103, y: 1 } },
  DESTINATION: { roomName: 'Destination venue', location: { x: 103.1, y: 1.1 } },
}

function renderJourneyWithWaitingSeconds(waitingSeconds: number): string {
  const shuttleLeg = journey.legs[1]
  if (!shuttleLeg || shuttleLeg.mode !== 'shuttle') {
    throw new Error('Test journey is missing its shuttle leg')
  }

  return renderToStaticMarkup(
    <TripJourneyResult
      state={{
        status: 'ready',
        journey: {
          ...journey,
          legs: [
            journey.legs[0],
            {
              ...shuttleLeg,
              waitingSeconds,
              durationSeconds: waitingSeconds + shuttleLeg.rideSeconds,
            },
          ],
          totalDurationSeconds: journey.totalDurationSeconds + waitingSeconds,
        },
        error: null,
      }}
      venues={venues}
      networkIndex={networkIndex}
    />,
  )
}

describe('TripJourneyResult', () => {
  it('shows the estimated Journey totals and ordered walking and shuttle details', () => {
    const markup = renderToStaticMarkup(
      <TripJourneyResult
        state={{ status: 'ready', journey, error: null }}
        venues={venues}
        networkIndex={networkIndex}
      />,
    )

    expect(markup).toContain('Recommended Journey')
    expect(markup).toContain('10 min')
    expect(markup).toContain('2.6 km')
    expect(markup).toContain('Walk')
    expect(markup).toContain(`Shuttle ${route.name}`)
    expect(markup).toContain('Wait Arriving now')
    expect(markup).toContain('Arriving now')
    expect(markup).toContain('Ride')
    expect(markup).toContain('Origin venue')
    expect(markup).toContain('Destination venue')
    expect(markup).toContain('aria-label="Journey details"')
    expect(markup).not.toContain('Board')
    expect(markup).not.toContain('Alight')
    expect(markup).not.toContain('Stops:')
    expect(markup).not.toContain('→')
    expect(markup).toContain('Live shuttle arrivals may be used when available')
  })

  it('flattens each Journey into one ordered timeline without repeating locations', () => {
    const entries = getJourneyTimelineEntries(journey, venues, networkIndex)

    expect(entries.map((entry) => entry.kind)).toEqual([
      'location',
      'walking',
      'location',
      'shuttle',
      'location',
      'walking',
      'location',
    ])
    expect(entries.filter((entry) => entry.kind === 'location')).toHaveLength(4)
  })

  it('explains when the Journey was selected within a search budget', () => {
    const markup = renderToStaticMarkup(
      <TripJourneyResult
        state={{
          status: 'ready',
          journey: { ...journey, planningQuality: 'bounded' },
          error: null,
        }}
        venues={venues}
        networkIndex={networkIndex}
      />,
    )

    expect(markup).toContain('A faster route may exist')
    expect(markup).not.toContain('Fastest estimated Journey')
  })

  it.each([
    [0, 'Arriving now'],
    [29, 'Arriving soon'],
    [60, '1 min'],
    [119, '2 min'],
  ])('uses threshold wording for a %s-second wait', (waitingSeconds, expected) => {
    const markup = renderJourneyWithWaitingSeconds(waitingSeconds)

    expect(markup).toContain(`Wait ${expected}`)
  })

  it.each([
    ['loading', 'Calculating recommended Journey…'],
    ['no-route', 'No complete estimated Journey is available'],
    ['failed', 'Journey calculation is unavailable right now'],
  ] as const)('announces the %s state', (status, message) => {
    const markup = renderToStaticMarkup(
      <TripJourneyResult
        state={{ status, journey: null, error: status === 'failed' ? 'Unable to plan journey' : null }}
        venues={venues}
        networkIndex={networkIndex}
      />,
    )

    expect(markup).toContain(message)
    expect(markup).toContain('role="status"')
  })
})
