import { describe, expect, it } from 'vitest'
import { parseApiJourneyPlanningResponse } from './validation'

const waypointEndpoint = {
  kind: 'waypoint-coordinate',
  coordinate: { longitude: 103.78, latitude: 1.29 },
}

function response(origin: unknown) {
  return {
    outcome: 'paths',
    searchStatus: 'complete',
    candidates: [{
      candidateKey: 'walking-waypoint',
      adjustedDurationSeconds: 60,
      score: 1,
      path: {
        origin,
        destination: { kind: 'stop', id: 'STOP-A' },
        legs: [{
          mode: 'walking',
          from: origin,
          to: { kind: 'stop', id: 'STOP-A' },
          durationSeconds: 60,
          distanceMeters: 50,
          geometry: { type: 'LineString', coordinates: [[103.78, 1.29], [103.77, 1.3]] },
        }],
        totalDurationSeconds: 60,
        totalDistanceMeters: 50,
        estimateStatus: 'estimated',
        planningQuality: 'exact',
      },
    }],
  }
}

describe('Journey response waypoint endpoints', () => {
  it('accepts coordinate-only waypoint endpoints in a Path', () => {
    expect(parseApiJourneyPlanningResponse(response(waypointEndpoint))).toEqual(response(waypointEndpoint))
  })

  it('rejects private waypoint identity fields in coordinate endpoints', () => {
    const privateEndpoint = {
      ...waypointEndpoint,
      id: 'private-id',
      label: 'Quiet bench',
    }

    expect(parseApiJourneyPlanningResponse(response(privateEndpoint))).toBeNull()
  })
})
