// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import type { Journey } from '../../domain/trip/journey'
import type { ScoredJourneyCandidate } from '../../domain/trip/planner'
import { getJourneyCompactSummary, getJourneyTimelineEntries } from './journey-result-presentation'
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
      />,
    )

    expect(markup).toContain('Recommended')
    expect(markup).not.toContain('Alternative 2')
    expect(markup).toContain('10 min')
    expect(markup).toContain('2.6 km')
    expect(markup).not.toMatch(/\b\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}\b/)
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
    expect(markup).not.toContain('journey-option-endpoint-arrow')
    expect(markup).toContain('Live shuttle arrivals may be used when available')
    expect(markup).not.toContain('not guaranteed arrival times')
  })

  it('does not show a walking-only travel-time disclaimer', () => {
    const walkingJourney: Journey = {
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
        state={{ status: 'ready', journey: walkingJourney, candidates: [scoreJourney(walkingJourney)], error: null }}
        venues={venues}
        networkIndex={networkIndex}
      />,
    )

    expect(markup).not.toContain('Travel times are estimates, not guaranteed arrival times.')
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
    expect(markup).not.toContain('Alternative 2')
    expect(markup.match(/class="journey-option-summary"/g)).toHaveLength(2)
    expect(markup.match(/class="journey-result(?: journey-result-selected)?"/g)).toHaveLength(2)
  })

  it('renders recommendation and mode headers for each option without departure-arrival ranges', () => {
    const walkingJourney: Journey = {
      ...journey,
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
    }
    const shuttleLeg = journey.legs.find((leg) => leg.mode === 'shuttle')
    if (!shuttleLeg || shuttleLeg.mode !== 'shuttle') {
      throw new Error('Test journey is missing its shuttle leg')
    }
    const transferJourney: Journey = {
      ...journey,
      legs: [
        shuttleLeg,
        {
          ...shuttleLeg,
          from: shuttleLeg.to,
          to: shuttleLeg.from,
          boardingStopId: shuttleLeg.alightingStopId,
          alightingStopId: shuttleLeg.boardingStopId,
        },
      ],
      totalDurationSeconds: shuttleLeg.durationSeconds * 2,
      totalDistanceMeters: shuttleLeg.distanceMeters * 2,
    }
    const options = [
      scoreJourney(walkingJourney, 'walking-recommendation'),
      scoreJourney(journey, 'direct-shuttle'),
      scoreJourney(transferJourney, 'one-transfer'),
      scoreJourney(walkingJourney, 'walking-alternative'),
    ]
    const markup = renderToStaticMarkup(
      <JourneyResult
        state={{
          status: 'ready',
          journey: walkingJourney,
          candidates: options,
          displayedCandidates: options,
          selectedCandidateKey: 'walking-alternative',
          error: null,
        }}
        venues={venues}
        networkIndex={networkIndex}
      />,
    )

    const parsed = new DOMParser().parseFromString(markup, 'text/html')
    const [recommended, direct, transfer, walking] = Array.from(
      parsed.querySelectorAll('.journey-option-summary'),
    )
    expect(recommended?.querySelector('.journey-option-heading-recommended')?.textContent).toBe('Recommended')
    expect(recommended?.querySelector('.journey-option-heading-qualifier')?.textContent).toBe('Walking')
    expect(direct?.querySelector('.journey-option-heading-neutral')?.textContent).toBe('Direct shuttle')
    expect(transfer?.querySelector('.journey-option-heading-neutral')?.textContent).toBe('1 transfer')
    expect(walking?.querySelector('.journey-option-heading-neutral')?.textContent).toBe('Walking')
    expect(recommended?.getAttribute('aria-expanded')).toBe('false')
    expect(walking?.getAttribute('aria-expanded')).toBe('true')
    for (const option of [recommended, direct, transfer, walking]) {
      expect(option?.querySelector('.journey-option-times')).toBeNull()
      expect(option?.textContent).not.toMatch(/\b\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}\b/)
      expect(option?.querySelector('.journey-option-duration')).toBeTruthy()
      expect(option?.querySelector('.disclosure-chevron')).toBeTruthy()
      expect(option?.querySelector('.journey-option-summary-bottomline')).toBeTruthy()
    }
  })

  it('shows one accessible expanded option and keeps the first-ranked option in recommendation position', async () => {
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
    const options = [
      scoreJourney(journey, 'bus-recommendation'),
      scoreJourney(walkingAlternative, 'walking-alternative'),
    ]
    const onSelectCandidate = vi.fn()
    const user = userEvent.setup()
    const view = render(
      <JourneyResult
        state={{
          status: 'ready',
          journey,
          candidates: options,
          displayedCandidates: options,
          selectedCandidateKey: 'bus-recommendation',
          error: null,
        }}
        venues={venues}
        networkIndex={networkIndex}
        onSelectCandidate={onSelectCandidate}
      />,
    )

    const [firstOptionButton, secondOptionButton] = screen.getAllByRole('button')
    expect(firstOptionButton.getAttribute('aria-expanded')).toBe('true')
    expect(secondOptionButton.getAttribute('aria-expanded')).toBe('false')
    expect(secondOptionButton.getAttribute('aria-controls')).toBe('journey-option-details-2')
    expect(firstOptionButton.textContent).toContain('Recommended')
    expect(firstOptionButton.textContent).not.toMatch(/\b\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}\b/)
    expect(firstOptionButton.textContent).not.toContain('Depart')
    expect(firstOptionButton.textContent).not.toContain('Arrive')
    expect(firstOptionButton.textContent).not.toContain('Origin venue')
    expect(firstOptionButton.textContent).not.toContain('Destination venue')
    expect(firstOptionButton.textContent).toContain('10 min')
    expect(firstOptionButton.textContent).toContain('Walk 5 min')
    const summaryBottomRow = firstOptionButton.querySelector('.journey-option-summary-bottomline')
    expect(summaryBottomRow?.children[0]?.classList.contains('journey-option-modes')).toBe(true)
    expect(summaryBottomRow?.children[1]?.classList.contains('journey-option-walking-total')).toBe(true)
    expect(firstOptionButton.getAttribute('aria-current')).toBe('true')
    expect(firstOptionButton.querySelector('.disclosure-chevron')?.getAttribute('data-expanded')).toBe('true')
    expect(secondOptionButton.querySelector('.disclosure-chevron')?.getAttribute('data-expanded')).toBe('false')
    expect(screen.getByRole('img', { name: /Journey modes: Walk, .* shuttle, Walk/ })).toBeTruthy()
    expect(screen.getByText('Recommended')).toBeTruthy()
    expect(screen.getByText('Walking')).toBeTruthy()
    expect(screen.queryByText('Alternative 2')).toBeNull()
    expect(screen.queryByText('A faster route may exist')).toBeNull()

    await user.tab()
    expect(document.activeElement).toBe(firstOptionButton)
    await user.keyboard('{Enter}')
    expect(onSelectCandidate).toHaveBeenCalledWith('bus-recommendation')
    await user.tab()
    // The expanded timeline's accessible stop disclosure comes before the next option.
    await user.tab()
    expect(document.activeElement).toBe(secondOptionButton)
    await user.keyboard(' ')
    expect(onSelectCandidate).toHaveBeenLastCalledWith('walking-alternative')
    await user.click(secondOptionButton)
    expect(onSelectCandidate).toHaveBeenLastCalledWith('walking-alternative')

    view.rerender(
      <JourneyResult
        state={{
          status: 'ready',
          journey,
          candidates: options,
          displayedCandidates: options,
          selectedCandidateKey: 'walking-alternative',
          error: null,
        }}
        venues={venues}
        networkIndex={networkIndex}
        onSelectCandidate={onSelectCandidate}
      />,
    )

    const [firstOptionButtonAfterSelection, selectedAlternative] = screen.getAllByRole('button')
    expect(firstOptionButtonAfterSelection.getAttribute('aria-expanded')).toBe('false')
    expect(selectedAlternative.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('list', { name: 'Journey 2 details' })).toBeTruthy()
    await user.click(selectedAlternative)
    expect(onSelectCandidate).toHaveBeenLastCalledWith('walking-alternative')
    expect(selectedAlternative.getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps the first-ranked option aligned with the map Journey when candidate keys break a sequence tie', () => {
    const withRouteId = (routeId: string): Journey => ({
      ...journey,
      legs: journey.legs.map((leg) => leg.mode === 'shuttle' ? { ...leg, routeId } : leg),
    })
    const mapJourney = withRouteId('ZZZ')
    const sequenceFirst = scoreJourney(withRouteId('AAA'), 'z-candidate')
    const mapCandidate = scoreJourney(mapJourney, 'a-candidate')
    const markup = renderToStaticMarkup(
      <JourneyResult
        state={{
          status: 'ready',
          journey: mapJourney,
          candidates: [sequenceFirst, mapCandidate],
          error: null,
        }}
        venues={venues}
        networkIndex={networkIndex}
      />,
    )
    const firstOption = markup.indexOf('<li class="journey-results-item"')
    const secondOption = markup.indexOf('<li class="journey-results-item"', firstOption + 1)
    const firstRankedMarkup = markup.slice(firstOption, secondOption)

    expect(firstRankedMarkup).toContain('id="journey-option-summary-1" type="button"')
    expect(firstRankedMarkup).toContain('aria-expanded="true" aria-current="true"')
    expect(firstRankedMarkup).toContain('<span>ZZZ</span>')
    expect(markup.slice(secondOption)).toContain('<span>AAA</span>')
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
        state={{ status: 'ready', journey, candidates: [scoreJourney(journey)], error: null }}
        venues={collidingVenues}
        networkIndex={createTransitIndex(collidingNetwork)}
      />,
    )

    expect(markup).toContain('aria-label="COM 3, venue"')
    expect(markup).toContain('aria-label="COM 3, shuttle stop"')
  })

  it('summarizes ordered modes, canonical route labels, and total walking duration', () => {
    expect(getJourneyCompactSummary(journey, networkIndex)).toEqual({
      walkingDurationLabel: '5 min',
      modeSegments: [
        { kind: 'walking' },
        { kind: 'shuttle', routeLabel: route.name, routeColor: route.color },
        { kind: 'walking' },
      ],
    })
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
    expect(markup).toContain('Journey options')
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
