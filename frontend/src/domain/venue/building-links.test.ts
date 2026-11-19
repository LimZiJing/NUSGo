import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Building } from '@nusgo/shared/venue/buildings'
import type { VenueMap } from '@nusgo/shared/venue/types'
import { composeVenueData, validateBuildingCatalogue, validateFoodLocationMap, validateVenueSourceMap } from '@nusgo/shared/venue/validation'
import { buildBuildingIndex } from './building-index'
import { linkVenuesToBuildings } from './building-links'

function building(overrides: Partial<Building> & Pick<Building, 'id' | 'name'>): Building {
  return {
    aliases: [],
    elementId: `way/${overrides.id}`,
    location: { x: 103.77, y: 1.29 },
    locationKind: 'centroid',
    roomCodePrefixes: [],
    sourceRefs: [],
    ...overrides,
  }
}

const room = (roomName: string, buildingId?: string) => ({
  kind: 'room' as const,
  roomName,
  location: { x: 103.77, y: 1.29 },
  ...(buildingId ? { buildingId } : {}),
})

describe('linkVenuesToBuildings', () => {
  const index = buildBuildingIndex([
    building({ id: 'com1', name: 'COM1', roomCodePrefixes: ['COM1'] }),
    building({ id: 'lt-17', name: 'LT 17', roomCodePrefixes: ['LT17'] }),
    building({ id: 'rc-1', name: 'Saga College', groupKey: 'saga', roomCodePrefixes: ['RC1'] }),
    building({ id: 'rc-2', name: 'Saga College', groupKey: 'saga', roomCodePrefixes: ['RC1'] }),
  ], undefined, [{ venueCode: 'LT17', name: 'Lecture Theatre 17', buildingId: 'lt-17' }])
  const venues: VenueMap = {
    'COM1-0210': room('Seminar Room 10', 'com1'),
    'com1-0211': room('Seminar Room 11', 'com1'),
    'RC1-01-01': room('Saga classroom', 'saga'),
    'Y-CR3': room('Yale classroom'),
    LAW_SR3: room('SR 3'),
    Pinnacle: room('Pinnacle'),
  }
  const links = linkVenuesToBuildings(venues, index)

  it('links a room to its building by the code before the first dash or underscore, ignoring case', () => {
    expect(links.buildingByVenueCode.get('COM1-0210')?.id).toBe('com1')
    expect(links.buildingByVenueCode.get('com1-0211')?.id).toBe('com1')
    expect(links.buildingByVenueCode.get('RC1-01-01')?.id).toBe('saga')
  })

  it('treats a venue whose whole code is a building code as the building itself, not a room', () => {
    expect(links.wholeBuildingVenueCodes.has('LT17')).toBe(true)
    expect(links.buildingByVenueCode.get('LT17')?.id).toBe('lt-17')
    expect(links.roomCountByBuildingId.get('lt-17') ?? 0).toBe(0)
    expect(links.wholeBuildingVenueCodes.has('COM1-0210')).toBe(false)
  })

  it('points a whole-building venue at its NUSMods page, and leaves other buildings without one', () => {
    expect(links.nusmodsVenueCodeByBuildingId.get('lt-17')).toBe('LT17')
    expect(links.nusmodsVenueCodeByBuildingId.has('com1')).toBe(false)
  })

  it('counts only the rooms inside a building', () => {
    expect(links.roomCountByBuildingId.get('com1')).toBe(2)
    expect(links.roomCountByBuildingId.get('saga')).toBe(1)
  })

  it('keeps the room names of a whole-building venue searchable on the building', () => {
    expect(links.extraNamesByBuildingId.get('lt-17')).toEqual(['Lecture Theatre 17'])
  })

  it('leaves venues without a catalogue building unlinked', () => {
    for (const code of ['Y-CR3', 'LAW_SR3', 'Pinnacle']) {
      expect(links.buildingByVenueCode.has(code)).toBe(false)
      expect(links.wholeBuildingVenueCodes.has(code)).toBe(false)
    }
  })
})

describe('linkVenuesToBuildings with the real data', () => {
  const catalogue = validateBuildingCatalogue(JSON.parse(readFileSync('public/data/buildings.json', 'utf8')))
  const venueData = composeVenueData(
    validateVenueSourceMap(JSON.parse(readFileSync('public/data/venues.json', 'utf8'))),
    validateFoodLocationMap(JSON.parse(readFileSync('public/data/food.json', 'utf8'))),
    catalogue,
  )
  const venues: VenueMap = venueData.venues
  const buildings = buildBuildingIndex(catalogue.buildings, catalogue.source, venueData.wholeBuildingVenueAliases)
  const links = linkVenuesToBuildings(venues, buildings)

  it('treats the lecture theatres and Frontier as whole buildings', () => {
    expect(links.wholeBuildingVenueCodes.has('LT17')).toBe(true)
    expect(links.wholeBuildingVenueCodes.has('Frontier')).toBe(true)
    expect(links.buildingByVenueCode.get('Frontier')?.parts).toHaveLength(2)
  })

  it('links LT14 and LT15 as rooms inside AS6 rather than as buildings of their own', () => {
    for (const code of ['LT14', 'LT15']) {
      expect(links.wholeBuildingVenueCodes.has(code)).toBe(false)
      expect(links.buildingByVenueCode.get(code)?.id).toBe('as6')
    }
    expect(links.nusmodsVenueCodeByBuildingId.has('as6')).toBe(false)
  })

  it('keeps LAW_SR3, Y and Pinnacle unlinked and a one-room building as a building with one room', () => {
    expect(links.buildingByVenueCode.has('LAW_SR3')).toBe(false)
    expect(links.buildingByVenueCode.has('Y-CR3')).toBe(false)
    expect(links.buildingByVenueCode.has('Pinnacle')).toBe(false)
    expect(links.buildingByVenueCode.get('SH-SR1')?.id).toBe('sheares-hall')
    expect(links.roomCountByBuildingId.get('sheares-hall')).toBe(1)
  })

  it('links 583 rooms in total, matching the import report', () => {
    expect(links.buildingByVenueCode.size).toBe(583)
  })
})
