import { describe, expect, it } from 'vitest'
import { VenueValidationError, validateBuildingCatalogue } from '@nusgo/shared/venue/validation'

function building(overrides: Record<string, unknown> = {}) {
  return {
    id: 'com1',
    name: 'COM1',
    aliases: ['COM 1', 'Computing 1'],
    elementId: 'way/1',
    address: '13 Computing Drive',
    postal: '117417',
    location: { x: 103.7737, y: 1.2949 },
    roomCodePrefixes: ['COM1'],
    sourceRefs: [{ source: 'nus-digital-twin', elementId: 'way/1' }],
    ...overrides,
  }
}

function catalogue(buildings: unknown[] = [building()]) {
  return {
    version: 1,
    source: {
      name: 'NUS Digital Twin (City Syntax Lab)',
      url: 'https://www.nus-digital-twin.com/api/v1/buildings',
      fetchedOn: '2026-10-12',
      licenceNote: 'Sourced from OpenStreetMap and Google Maps by City Syntax Lab.',
    },
    buildings,
  }
}

describe('validateBuildingCatalogue', () => {
  it('returns an immutable validated snapshot', () => {
    const source = catalogue()

    const result = validateBuildingCatalogue(source)
    const sourceBuilding = source.buildings[0] as { name: string }
    sourceBuilding.name = 'Changed'

    expect(result.buildings[0].name).toBe('COM1')
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.source)).toBe(true)
    expect(Object.isFrozen(result.buildings)).toBe(true)
    expect(Object.isFrozen(result.buildings[0])).toBe(true)
    expect(Object.isFrozen(result.buildings[0].location)).toBe(true)
    expect(Object.isFrozen(result.buildings[0].aliases)).toBe(true)
  })

  it('reports malformed fields in stable building and field order', () => {
    const issues = issuesFor(catalogue([
      building({ id: ' ', name: '', location: { x: 181, y: Number.NaN } }),
      null,
      building({ id: 'b3', elementId: 'way/3', aliases: 'COM 3', postal: '12345', roomCodePrefixes: [''] }),
    ]))

    expect(issues).toEqual([
      'Building #1 id must be a non-empty string',
      'Building #1 name must be a non-empty string',
      'Building #1 has invalid longitude: 181',
      'Building #1 has invalid latitude: NaN',
      'Building #2 must be an object',
      'Building b3 aliases must be an array of non-empty strings',
      'Building b3 postal must be a 6-digit string when provided',
      'Building b3 roomCodePrefixes must be an array of non-empty strings',
    ])
  })

  it('rejects duplicate ids, duplicate elementIds and prefixes shared by two buildings', () => {
    const issues = issuesFor(catalogue([
      building({ id: 'a', elementId: 'way/1', roomCodePrefixes: ['COM1'] }),
      building({ id: 'a', elementId: 'way/2', roomCodePrefixes: ['COM2'] }),
      building({ id: 'b', elementId: 'way/1', roomCodePrefixes: ['com1', 'COM-2'] }),
    ]))

    expect(issues).toEqual([
      'Building id a is used by more than one building',
      'Building elementId way/1 is used by more than one building',
      'Room code prefix COM1 is claimed by more than one building (a, b)',
      'Room code prefix COM2 is claimed by more than one building (a, b)',
    ])
  })

  it('lets parts of one group share a room code prefix but not unrelated buildings', () => {
    const parts = catalogue([
      building({ id: 'saga-1', elementId: 'way/1', groupKey: 'saga-college', roomCodePrefixes: ['RC1'] }),
      building({ id: 'saga-2', elementId: 'way/2', groupKey: 'saga-college', roomCodePrefixes: ['rc1'] }),
    ])
    expect(validateBuildingCatalogue(parts).buildings).toHaveLength(2)

    expect(issuesFor(catalogue([
      building({ id: 'saga-1', elementId: 'way/1', groupKey: 'saga-college', roomCodePrefixes: ['RC1'] }),
      building({ id: 'elm-1', elementId: 'way/2', groupKey: 'elm-college', roomCodePrefixes: ['RC1'] }),
      building({ id: 'other', elementId: 'way/3', roomCodePrefixes: ['RC1'] }),
    ]))).toEqual([
      'Room code prefix RC1 is claimed by more than one building (saga-1, elm-1, other)',
    ])
  })

  it('accepts a centroid or provisional entrance marker and rejects anything else', () => {
    expect(validateBuildingCatalogue(catalogue([building({ locationKind: 'centroid' })])).buildings).toHaveLength(1)
    expect(validateBuildingCatalogue(catalogue([building({ locationKind: 'provisional-entrance' })])).buildings)
      .toHaveLength(1)
    expect(issuesFor(catalogue([building({ locationKind: 'entrance' })]))).toEqual([
      'Building com1 locationKind must be "centroid" or "provisional-entrance" when provided',
    ])
  })

  it('accepts an empty building list and repeated names', () => {
    expect(validateBuildingCatalogue(catalogue([])).buildings).toEqual([])
    expect(validateBuildingCatalogue(catalogue([
      building({ id: 'cendana-1', name: 'Cendana College', elementId: 'way/10', groupKey: 'cendana-college', roomCodePrefixes: [] }),
      building({ id: 'cendana-2', name: 'Cendana College', elementId: 'way/11', groupKey: 'cendana-college', roomCodePrefixes: [] }),
    ])).buildings).toHaveLength(2)
  })

  it('accepts locations marked as API centroids and rejects unknown location kinds', () => {
    const result = validateBuildingCatalogue(catalogue([building({ locationKind: 'centroid' })]))

    expect(result.buildings[0].locationKind).toBe('centroid')
    expect(issuesFor(catalogue([building({ locationKind: 'entrance' })]))).toEqual([
      'Building com1 locationKind must be "centroid" or "provisional-entrance" when provided',
    ])
  })

  it('accepts part labels, blocks and an entrance role on grouped buildings', () => {
    const result = validateBuildingCatalogue(catalogue([
      building({ id: 'saga-1', elementId: 'way/1', groupKey: 'saga', partLabel: 'Blocks 15-17', blocks: ['15', '16', '17'], roomCodePrefixes: ['RC1'] }),
      building({ id: 'saga-2', elementId: 'way/2', groupKey: 'saga', partLabel: 'Blocks 18-20', blocks: ['18'], roomCodePrefixes: ['RC2'] }),
      building({ id: 'saga-entrance', elementId: 'way/3', groupKey: 'saga', groupRole: 'entrance', roomCodePrefixes: [] }),
    ]))

    expect(result.buildings.map((item) => [item.id, item.partLabel, item.blocks, item.groupRole])).toEqual([
      ['saga-1', 'Blocks 15-17', ['15', '16', '17'], undefined],
      ['saga-2', 'Blocks 18-20', ['18'], undefined],
      ['saga-entrance', undefined, undefined, 'entrance'],
    ])
  })

  it('rejects an empty partLabel, malformed or repeated blocks, and an unknown groupRole', () => {
    expect(issuesFor(catalogue([building({ groupKey: 'saga', partLabel: ' ' })]))).toEqual([
      'Building com1 partLabel must be a non-empty string when provided',
    ])
    expect(issuesFor(catalogue([building({ groupKey: 'saga', blocks: ['15', '15'] })]))).toEqual([
      'Building com1 blocks must be an array of non-empty strings with no duplicates when provided',
    ])
    expect(issuesFor(catalogue([building({ groupKey: 'saga', blocks: [''] })]))).toEqual([
      'Building com1 blocks must be an array of non-empty strings with no duplicates when provided',
    ])
    expect(issuesFor(catalogue([building({ groupKey: 'saga', groupRole: 'lobby' })]))).toEqual([
      'Building com1 groupRole must be "entrance" when provided',
    ])
  })

  it('accepts block locations keyed by listed blocks, with some blocks left out', () => {
    const result = validateBuildingCatalogue(catalogue([
      building({
        groupKey: 'saga',
        blocks: ['5', '6', '7', '8'],
        blockLocations: { 5: { x: 103.7739, y: 1.295 }, 8: { x: 103.774, y: 1.2951 } },
      }),
    ]))

    expect(result.buildings[0]?.blockLocations).toEqual({ 5: { x: 103.7739, y: 1.295 }, 8: { x: 103.774, y: 1.2951 } })
  })

  it('rejects block locations that are not objects, name an unlisted block or have bad coordinates', () => {
    expect(issuesFor(catalogue([building({ groupKey: 'saga', blocks: ['5'], blockLocations: [] })]))).toEqual([
      'Building com1 blockLocations must be an object when provided',
    ])
    expect(issuesFor(catalogue([building({ groupKey: 'saga', blocks: ['5'], blockLocations: { 9: { x: 103.7739, y: 1.295 } } })]))).toEqual([
      'Building com1 blockLocations["9"] must match a block listed in blocks',
    ])
    expect(issuesFor(catalogue([building({ groupKey: 'saga', blocks: ['5'], blockLocations: { 5: { x: 200, y: 1.295 } } })]))).toEqual([
      'Building com1 blockLocations["5"] has invalid longitude: 200',
    ])
    expect(issuesFor(catalogue([building({ groupKey: 'saga', blocks: ['5'], blockLocations: { 5: { x: 103.7739, y: 91 } } })]))).toEqual([
      'Building com1 blockLocations["5"] has invalid latitude: 91',
    ])
    expect(issuesFor(catalogue([building({ blockLocations: { 5: { x: 103.7739, y: 1.295 } } })]))).toEqual([
      'Building com1 blockLocations requires blocks',
    ])
  })

  it('requires a groupKey for partLabel, blocks and groupRole', () => {
    expect(issuesFor(catalogue([building({ partLabel: 'Blocks 15-17', blocks: ['15'], groupRole: 'entrance' })]))).toEqual([
      'Building com1 partLabel requires a groupKey',
      'Building com1 blocks requires a groupKey',
      'Building com1 groupRole requires a groupKey',
    ])
    expect(validateBuildingCatalogue(catalogue([building({ groupKey: 'saga', partLabel: 'Blocks 15-17' })])).buildings)
      .toHaveLength(1)
  })

  it('allows at most one entrance record per group', () => {
    expect(validateBuildingCatalogue(catalogue([
      building({ id: 'saga-entrance', elementId: 'way/1', groupKey: 'saga', groupRole: 'entrance', roomCodePrefixes: [] }),
      building({ id: 'elm-entrance', elementId: 'way/2', groupKey: 'elm', groupRole: 'entrance', roomCodePrefixes: [] }),
    ])).buildings).toHaveLength(2)

    expect(issuesFor(catalogue([
      building({ id: 'saga-entrance', elementId: 'way/1', groupKey: 'saga', groupRole: 'entrance', roomCodePrefixes: [] }),
      building({ id: 'saga-gate', elementId: 'way/2', groupKey: 'saga', groupRole: 'entrance', roomCodePrefixes: [] }),
    ]))).toEqual([
      'Group saga has more than one entrance record (saga-entrance, saga-gate)',
    ])
  })

  it('requires part labels on every non-entrance part of a group, or on none', () => {
    expect(validateBuildingCatalogue(catalogue([
      building({ id: 'saga-1', elementId: 'way/1', groupKey: 'saga', partLabel: 'Blocks 15-17', roomCodePrefixes: ['RC1'] }),
      building({ id: 'saga-2', elementId: 'way/2', groupKey: 'saga', partLabel: 'Blocks 18-20', roomCodePrefixes: ['RC2'] }),
      building({ id: 'saga-entrance', elementId: 'way/3', groupKey: 'saga', groupRole: 'entrance', roomCodePrefixes: [] }),
    ])).buildings).toHaveLength(3)
    expect(validateBuildingCatalogue(catalogue([
      building({ id: 'saga-1', elementId: 'way/1', groupKey: 'saga', roomCodePrefixes: ['RC1'] }),
      building({ id: 'saga-2', elementId: 'way/2', groupKey: 'saga', roomCodePrefixes: ['RC2'] }),
    ])).buildings).toHaveLength(2)

    expect(issuesFor(catalogue([
      building({ id: 'saga-1', elementId: 'way/1', groupKey: 'saga', partLabel: 'Blocks 15-17', roomCodePrefixes: ['RC1'] }),
      building({ id: 'saga-2', elementId: 'way/2', groupKey: 'saga', roomCodePrefixes: ['RC2'] }),
      building({ id: 'saga-entrance', elementId: 'way/3', groupKey: 'saga', groupRole: 'entrance', roomCodePrefixes: [] }),
    ]))).toEqual([
      'Group saga must give partLabel to every non-entrance part or to none (missing: saga-2)',
    ])
  })

  it('rejects an unsupported version, missing source metadata and non-array buildings', () => {
    expect(issuesFor({ ...catalogue(), version: 2 })).toEqual([
      'Building catalogue version must be 1: 2',
    ])
    expect(issuesFor({ ...catalogue(), source: { name: 'x' } })).toEqual([
      'Building catalogue source url must be a non-empty string',
      'Building catalogue source fetchedOn must be a YYYY-MM-DD date',
      'Building catalogue source licenceNote must be a non-empty string',
    ])
    expect(issuesFor({ ...catalogue(), buildings: {} })).toEqual([
      'Building catalogue buildings must be an array',
    ])
    expect(issuesFor('nope')).toEqual(['Building catalogue must be an object'])
  })
})

function issuesFor(input: unknown): readonly string[] {
  try {
    validateBuildingCatalogue(input)
  } catch (caught) {
    expect(caught).toBeInstanceOf(VenueValidationError)
    return (caught as VenueValidationError).issues
  }
  throw new Error('Expected validation to fail')
}
