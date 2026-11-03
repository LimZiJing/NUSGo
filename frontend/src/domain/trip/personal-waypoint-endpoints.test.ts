import { describe, expect, it } from 'vitest'
import type { PersonalWaypoint } from '../waypoints/personal/personal-waypoint'
import { createEmptyTripRequest } from './endpoints'
import {
  createPersonalWaypointTripEndpoint,
  reconcilePersonalWaypointEndpoints,
} from './personal-waypoint-endpoints'

function waypoint(overrides: Partial<PersonalWaypoint> = {}): PersonalWaypoint {
  return {
    id: '00000000-0000-4000-8000-000000000041',
    name: 'Quiet bench',
    category: 'Rest areas',
    coordinate: { longitude: 103.78, latitude: 1.29 },
    markerColor: 'blue',
    markerIcon: 'dot',
    note: 'Near the sheltered walkway',
    createdAt: '2026-10-25T00:00:00.000Z',
    updatedAt: '2026-10-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('Personal Waypoint trip endpoints', () => {
  it('keeps only the stable ID, label, and coordinate in browser state', () => {
    const endpoint = createPersonalWaypointTripEndpoint(waypoint())
    if (!endpoint) throw new Error('Expected a valid Personal Waypoint endpoint')

    expect(endpoint).toEqual({
      kind: 'personal-waypoint',
      id: '00000000-0000-4000-8000-000000000041',
      label: 'Quiet bench',
      coordinate: { longitude: 103.78, latitude: 1.29 },
    })
    expect(Object.isFrozen(endpoint)).toBe(true)
    expect(Object.isFrozen(endpoint.coordinate)).toBe(true)
  })

  it('refreshes a selected endpoint from an edited record with the same ID', () => {
    const original = waypoint()
    const edited = waypoint({
      name: 'New bench name',
      coordinate: { longitude: 103.79, latitude: 1.3 },
      updatedAt: '2026-10-26T00:00:00.000Z',
    })
    const request = {
      origin: createPersonalWaypointTripEndpoint(original),
      destination: { kind: 'stop', id: 'STOP-A' } as const,
    }

    expect(reconcilePersonalWaypointEndpoints(request, [edited])).toEqual({
      origin: {
        kind: 'personal-waypoint',
        id: original.id,
        label: 'New bench name',
        coordinate: edited.coordinate,
      },
      destination: request.destination,
    })
  })

  it('clears deleted waypoint endpoints and leaves other endpoint state intact', () => {
    const endpoint = createPersonalWaypointTripEndpoint(waypoint())
    const request = { origin: endpoint, destination: endpoint }

    expect(reconcilePersonalWaypointEndpoints(request, [])).toEqual(createEmptyTripRequest())
  })
})
