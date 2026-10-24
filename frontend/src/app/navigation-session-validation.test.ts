import { describe, expect, it } from 'vitest'
import type { Building } from '@nusgo/shared/venue/buildings'
import { buildBuildingIndex } from '../domain/venue/building-index'
import { canonicalizeTripEndpoint } from './navigation-session-validation'

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
