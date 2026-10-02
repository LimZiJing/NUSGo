import { describe, expect, it } from 'vitest'
import type { LoadedTransitData } from '../../src/app/contracts/data'
import type { Journey } from '../../src/domain/trip/journey'
import type { JourneyBenchmarkCase } from './contract'
import { validateJourneyBenchmarkOutcome } from './outcome'

const origin = { kind: 'stop', id: 'A' } as const
const destination = { kind: 'stop', id: 'B' } as const

const transit = {
  index: {
    stopById: new Map([
      ['A', { id: 'A' }],
      ['B', { id: 'B' }],
    ]),
    routeById: new Map([
      ['R1', { id: 'R1', stopIds: ['A', 'B'] }],
    ]),
  },
} as unknown as LoadedTransitData

const venues = {}

function createCase(
  expected: JourneyBenchmarkCase['expected'],
): JourneyBenchmarkCase {
  return {
    id: 'fixture',
    label: 'fixture',
    origin,
    destination,
    arrivalSeconds: 60,
    expected,
    searchInput: undefined as unknown as JourneyBenchmarkCase['searchInput'],
  }
}

function createWalkJourney(): Journey {
  return {
    origin,
    destination,
    legs: [{
      mode: 'walking',
      from: origin,
      to: destination,
      durationSeconds: 50,
      distanceMeters: 40,
      geometry: { type: 'LineString', coordinates: [[103.77, 1.29], [103.771, 1.291]] },
    }],
    totalDurationSeconds: 50,
    totalDistanceMeters: 40,
    estimateStatus: 'estimated',
    planningQuality: 'exact',
  }
}

describe('validateJourneyBenchmarkOutcome', () => {
  it('accepts a valid direct-walk Journey that matches the case expectation', () => {
    const result = validateJourneyBenchmarkOutcome({
      kind: 'journey',
      journey: createWalkJourney(),
    }, createCase({ outcome: 'journey', shuttleBoardings: 0, modes: ['walking'] }), transit, venues)

    expect(result.valid).toBe(true)
    expect(result.result).toMatchObject({
      kind: 'journey',
      modes: ['walking'],
      shuttleBoardings: 0,
      totalDurationSeconds: 50,
    })
  })

  it('rejects Journey totals that do not equal the leg totals', () => {
    const journey = { ...createWalkJourney(), totalDurationSeconds: 51 }
    const result = validateJourneyBenchmarkOutcome({ kind: 'journey', journey }, createCase({ outcome: 'journey' }), transit, venues)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('journey totalDurationSeconds must equal the sum of its leg durations')
  })

  it('validates shuttle route direction, wait, ride, and case boardings', () => {
    const journey: Journey = {
      origin,
      destination,
      legs: [{
        mode: 'shuttle',
        from: origin,
        to: destination,
        routeId: 'R1',
        boardingStopId: 'A',
        alightingStopId: 'B',
        waitingSeconds: 10,
        rideSeconds: 80,
        durationSeconds: 90,
        distanceMeters: 1200,
        geometry: { type: 'LineString', coordinates: [[103.77, 1.29], [103.771, 1.291]] },
      }],
      totalDurationSeconds: 90,
      totalDistanceMeters: 1200,
      estimateStatus: 'estimated',
      planningQuality: 'exact',
    }
    const result = validateJourneyBenchmarkOutcome(
      { kind: 'journey', journey },
      createCase({ outcome: 'journey', shuttleBoardings: 1, modes: ['shuttle'] }),
      transit,
      venues,
    )

    expect(result.valid).toBe(true)
  })

  it('accepts an explicit no-route result only when the case expects one', () => {
    const expectedNoRoute = validateJourneyBenchmarkOutcome(
      { kind: 'no-route', reason: 'No complete path.' },
      createCase({ outcome: 'no-route' }),
      transit,
      venues,
    )
    const unexpectedNoRoute = validateJourneyBenchmarkOutcome(
      { kind: 'no-route', reason: 'No complete path.' },
      createCase({ outcome: 'journey' }),
      transit,
      venues,
    )

    expect(expectedNoRoute.valid).toBe(true)
    expect(unexpectedNoRoute.errors).toContain('expected journey; got no-route')
  })
})
