import { describe, expect, it } from 'vitest'
import { VenueValidationError, validateBuildingCatalogue } from '@navus/shared/venue/validation'

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
