import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import type { Journey } from '../../domain/trip/journey'
import type { ScoredJourneyCandidate } from '../../domain/trip/planner'
import { getJourneyTimelineEntries } from './journey-result-presentation'
import { JourneyResult } from './journey-result'

const network = createValidTransitNetwork()
network.routes[0].stopIds = ['STOP-A', 'STOP-MID', 'STOP-B']
network.stops.push({
  id: 'STOP-MID',
  longName: 'Middle Stop',
  shortName: 'MID',
  latitude: 1.05,
  longitude: 103.05,
  services: ['A1'],
  opposite: null,
})
const networkIndex = createTransitIndex(network)
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

function scoreJourney(candidateJourney: Journey, candidateKey = 'test-candidate'): ScoredJourneyCandidate {
  let shuttleBoardings = 0
  let adjustedDurationSeconds = 0
  for (const leg of candidateJourney.legs) {
    if (leg.mode === 'walking') {
      adjustedDurationSeconds += leg.durationSeconds / 0.8
    } else {
      adjustedDurationSeconds += leg.durationSeconds / (shuttleBoardings > 0 ? 0.9 : 1)
      shuttleBoardings += 1
    }
  }
  return {
    candidateKey,
    journey: candidateJourney,
    adjustedDurationSeconds,
    score: adjustedDurationSeconds === 0 ? Number.POSITIVE_INFINITY : 1 / adjustedDurationSeconds,
  }
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
    <JourneyResult
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
            journey.legs[2],
          ],
          totalDurationSeconds: journey.totalDurationSeconds + waitingSeconds,
        },
        candidates: [scoreJourney({
          ...journey,
          legs: [
            journey.legs[0],
            {
              ...shuttleLeg,
              waitingSeconds,
              durationSeconds: waitingSeconds + shuttleLeg.rideSeconds,
            },
            journey.legs[2],
          ],
          totalDurationSeconds: journey.totalDurationSeconds + waitingSeconds,
        })],
        error: null,
      }}
      venues={venues}
      networkIndex={networkIndex}
    />,
  )
}

describe('JourneyResult', () => {
  it('shows the estimated Journey totals and ordered walking and shuttle details', () => {
    const markup = renderToStaticMarkup(
      <JourneyResult
        state={{ status: 'ready', journey, candidates: [scoreJourney(journey)], error: null }}
        venues={venues}
        networkIndex={networkIndex}
        referenceTimeMs={Date.parse('2026-09-23T00:00:00Z')}
      />,
    )

    expect(markup).toContain('Recommended')
    expect(markup).not.toContain('Recommended Journey')
    expect(markup).toContain('10 min')
    expect(markup).toContain('2.6 km')
    expect(markup).toContain('Arrive 08:10')
    expect(markup).toContain('Walk')
    expect(markup).toContain('journey-walking-icon')
    expect(markup).toContain(`>${route.name}<`)
    expect(markup).toContain('journey-bus-icon')
    expect(markup).toContain('journey-disclosure-chevron')
    expect(markup).toContain(`aria-label="${route.name}, show bus stops"`)
    expect(markup).toContain('journey-stop-marker')
    expect(markup).toContain('>MID</span>')
    expect(markup).not.toContain('Middle Stop')
    expect(markup).toContain(`--journey-route-color:${route.color}`)
    expect(markup).toContain('Wait Arriving now')
    expect(markup).toContain('Arriving now')
    expect(markup).toContain('Ride')
    expect(markup).toContain('Origin venue')
    expect(markup).toContain('Destination venue')
    expect(markup).toContain('location-identity-icon--venue')
    expect(markup).toContain('location-identity-icon--stop')
    expect(markup).toContain('aria-label="Origin venue, venue"')
    expect(markup).toContain('aria-label="Stop A, shuttle stop"')
    expect(markup).toContain('aria-label="MID, shuttle stop, code STOP-MID"')
    expect(markup).toContain('aria-label="Journey details"')
    expect(markup).not.toContain('Board')
    expect(markup).not.toContain('Alight')
    expect(markup).not.toContain('Stops:')
    expect(markup).not.toContain('→')
    expect(markup).toContain('Live shuttle arrivals may be used when available')
  })

  it('renders every Journey chosen from the candidate pool as an ordered Plan option', () => {
    const walkingAlternative: Journey = {
      origin: journey.origin,
      destination: journey.destination,
      legs: [{
        mode: 'walking',
        from: journey.origin,
        to: journey.destination,
        durationSeconds: 600,
        distanceMeters: 4200,
        geometry: { type: 'LineString', coordinates: [[103, 1], [103.2, 1.2]] },
      }],
      totalDurationSeconds: 600,
      totalDistanceMeters: 4200,
      estimateStatus: 'estimated',
      planningQuality: 'exact',
    }
    const markup = renderToStaticMarkup(
      <JourneyResult
        state={{
          status: 'ready',
          journey,
          candidates: [
            scoreJourney(walkingAlternative, 'walking-alternative'),
            scoreJourney(journey, 'bus-recommendation'),
          ],
          error: null,
        }}
        venues={venues}
        networkIndex={networkIndex}
      />,
    )

    expect(markup).toContain('aria-label="Journey options"')
    expect(markup).toContain('Recommended')
    expect(markup).toContain('Alternative 2')
    expect(markup.match(/class="journey-result"/g)).toHaveLength(2)
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
    expect(entries.filter((entry) => entry.kind === 'location').map((entry) => entry.locationKind))
      .toEqual(['venue', 'stop', 'stop', 'venue'])
    expect(entries.find((entry) => entry.kind === 'shuttle')).toMatchObject({
      routeColor: route.color,
      intermediateStops: [{ id: 'STOP-MID', label: 'MID' }],
    })
  })

  it('keeps a venue and shuttle stop distinct when their journey names match', () => {
    const collidingVenues = {
      ...venues,
      ORIGIN: { ...venues.ORIGIN, roomName: 'COM 3' },
    }
    const collidingNetwork = createValidTransitNetwork()
    collidingNetwork.stops[0] = {
      ...collidingNetwork.stops[0],
      longName: 'COM 3',
      shortName: 'COM 3',
    }
    const markup = renderToStaticMarkup(
      <JourneyResult
        state={{ status: 'ready', journey, error: null }}
        venues={collidingVenues}
        networkIndex={createTransitIndex(collidingNetwork)}
      />,
    )

    expect(markup).toContain('aria-label="COM 3, venue"')
    expect(markup).toContain('aria-label="COM 3, shuttle stop"')
  })

  it('explains when the Journey was selected within a search budget', () => {
    const markup = renderToStaticMarkup(
      <JourneyResult
        state={{
          status: 'ready',
          journey: { ...journey, planningQuality: 'bounded' },
          candidates: [scoreJourney({ ...journey, planningQuality: 'bounded' })],
          error: null,
        }}
        venues={venues}
        networkIndex={networkIndex}
      />,
    )

    expect(markup).toContain('A faster route may exist')
    expect(markup).not.toContain('Fastest estimated Journey')
  })

  it('leaves the detailed simulation notice to PlanView', () => {
    const markup = renderToStaticMarkup(
      <JourneyResult
        state={{ status: 'ready', journey, candidates: [scoreJourney(journey)], error: null }}
        venues={venues}
        networkIndex={networkIndex}
        simulated
      />,
    )

    expect(markup).not.toContain('simulated route')
    expect(markup).toContain('Recommended')
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
      <JourneyResult
        state={{
          status,
          journey: null,
          candidates: [],
          error: status === 'failed' ? 'Unable to plan journey' : null,
        }}
        venues={venues}
        networkIndex={networkIndex}
      />,
    )

    expect(markup).toContain(message)
    expect(markup).toContain('role="status"')
  })
})
