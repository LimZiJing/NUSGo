import { describe, expect, it } from 'vitest'
import type { Building } from '@nusgo/shared/venue/buildings'
import { buildBuildingIndex } from '../domain/venue/building-index'
import { canonicalizeTripEndpoint } from './navigation-session-validation'
import type { PersonalWaypoint } from '../domain/waypoints/personal/personal-waypoint'

function building(overrides: Partial<Building> & Pick<Building, 'id'>): Building {
  return {
    name: 'Hall',
    aliases: [],
    elementId: `way/${overrides.id}`,
    location: { x: 103.78, y: 1.29 },
    locationKind: 'centroid',
    roomCodePrefixes: [],
    sourceRefs: [],
    ...overrides,
  }
}

describe('canonicalizeTripEndpoint for buildings', () => {
  const buildings = buildBuildingIndex([
    building({ id: 'hall', groupKey: 'hall', groupRole: 'entrance' }),
    building({ id: 'hall-a', groupKey: 'hall', partLabel: 'Block A', blocks: ['A'] }),
  ])

  it('accepts a group ID and the ID of one building of the group, and rejects unknown IDs', () => {
    expect(canonicalizeTripEndpoint({ kind: 'building', id: 'hall' }, null, null, buildings)).toEqual({ kind: 'building', id: 'hall' })
    expect(canonicalizeTripEndpoint({ kind: 'building', id: 'hall-a' }, null, null, buildings)).toEqual({ kind: 'building', id: 'hall-a' })
    expect(canonicalizeTripEndpoint({ kind: 'building', id: 'nope' }, null, null, buildings)).toBeNull()
  })
})

describe('canonicalizeTripEndpoint for Personal Waypoints', () => {
  const waypoint: PersonalWaypoint = {
    id: '00000000-0000-4000-8000-000000000041',
    name: 'Quiet bench',
    category: 'Rest areas',
    coordinate: { longitude: 103.78, latitude: 1.29 },
    markerColor: 'blue',
    markerIcon: 'dot',
    createdAt: '2026-10-25T00:00:00.000Z',
    updatedAt: '2026-10-25T00:00:00.000Z',
  }

  it('resolves the selected ID against the local collection and ignores caller-provided details', () => {
    const selected = canonicalizeTripEndpoint({
      kind: 'personal-waypoint',
      id: waypoint.id,
      label: 'Forged name',
      coordinate: { longitude: 0, latitude: 0 },
    }, null, null, null, new Map([[waypoint.id, waypoint]]))

    expect(selected).toMatchObject({
      kind: 'personal-waypoint',
      id: waypoint.id,
      label: 'Quiet bench',
      coordinate: waypoint.coordinate,
    })
  })

  it('rejects a Personal Waypoint when the local collection is unavailable or does not contain it', () => {
    const endpoint = { kind: 'personal-waypoint', id: waypoint.id }
    expect(canonicalizeTripEndpoint(endpoint, null, null)).toBeNull()
    expect(canonicalizeTripEndpoint(endpoint, null, null, null, new Map())).toBeNull()
  })
})
