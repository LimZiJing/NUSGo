import { describe, expect, it } from 'vitest'
import {
  composeVenueData,
  validateBuildingCatalogue,
  validateFoodLocationMap,
  validateVenueMap,
  validateVenueSourceMap,
  VenueValidationError,
} from './validation.ts'

const buildings = validateBuildingCatalogue({
  version: 1,
  source: {
    name: 'Test catalogue',
    url: 'https://example.test/buildings',
    fetchedOn: '2026-01-01',
    licenceNote: 'Test data',
  },
  buildings: [
    {
      id: 'com1',
      name: 'COM1',
      aliases: [],
      elementId: 'way/com1',
      location: { x: 103.77, y: 1.29 },
      roomCodePrefixes: ['COM1'],
      sourceRefs: [{ source: 'test', elementId: 'way/com1' }],
    },
    {
      id: 'lt-17',
      name: 'LT 17',
      aliases: ['LT17'],
      elementId: 'way/lt-17',
      location: { x: 103.77, y: 1.29 },
      roomCodePrefixes: ['LT17'],
      sourceRefs: [{ source: 'test', elementId: 'way/lt-17' }],
    },
  ],
})

describe('composeVenueData', () => {
  it('creates typed Rooms and Food while retaining whole-building aliases separately', () => {
    const result = composeVenueData(
      validateVenueSourceMap({
        'COM1-0210': {
          roomName: 'Seminar Room 10',
          floor: 2,
          location: { x: 103.77, y: 1.29 },
        },
        LT17: {
          roomName: 'Lecture Theatre 17',
          floor: 1,
          location: { x: 103.77, y: 1.29 },
        },
      }),
      validateFoodLocationMap({
        'the-terrace-canteen': {
          name: 'The Terrace',
          foodType: 'canteen',
          location: { x: 103.78, y: 1.29 },
        },
      }),
      buildings,
    )

    expect(result.venues).toEqual({
      'COM1-0210': {
        kind: 'room',
        roomName: 'Seminar Room 10',
        floor: 2,
        location: { x: 103.77, y: 1.29 },
        buildingId: 'com1',
      },
      'the-terrace-canteen': {
        kind: 'food',
        name: 'The Terrace',
        foodType: 'canteen',
        location: { x: 103.78, y: 1.29 },
      },
    })
    expect(result.wholeBuildingVenueAliases).toEqual([
      { venueCode: 'LT17', name: 'Lecture Theatre 17', buildingId: 'lt-17' },
    ])
  })

  it('keeps a validated Building relationship when a Food ID reuses a Room code', () => {
    const result = composeVenueData(
      validateVenueSourceMap({
        'COM1-0210': { roomName: 'Seminar Room 10' },
      }),
      validateFoodLocationMap({
        'COM1-0210': {
          name: 'COM1 Cafe',
          foodType: 'drinks & snacks',
          location: { x: 103.78, y: 1.29 },
        },
      }),
      buildings,
    )

    expect(result.venues['COM1-0210']).toEqual({
      kind: 'food',
      name: 'COM1 Cafe',
      foodType: 'drinks & snacks',
      location: { x: 103.78, y: 1.29 },
      buildingId: 'com1',
    })
  })

  it('does not infer a Food building relationship from a room-code prefix', () => {
    const result = composeVenueData(
      validateVenueSourceMap({}),
      validateFoodLocationMap({
        'COM1-cafe': {
          name: 'COM1 Cafe',
          foodType: 'drinks & snacks',
          location: { x: 103.78, y: 1.29 },
        },
      }),
      buildings,
    )

    expect(result.venues['COM1-cafe']).not.toHaveProperty('buildingId')
  })
})

describe('validateVenueMap', () => {
  it('rejects unknown venue kinds and invalid Food types', () => {
    expect(() => validateVenueMap({
      'study-spot': { kind: 'study-spot', name: 'Quiet table' },
    })).toThrow(VenueValidationError)
    expect(() => validateVenueMap({
      cafe: {
        kind: 'food',
        name: 'Cafe',
        foodType: 'cafe',
        location: { x: 103.78, y: 1.29 },
      },
    })).toThrow(/foodType/)
  })

  it('validates FoodType in the source catalogue', () => {
    expect(() => validateFoodLocationMap({
      cafe: {
        name: 'Cafe',
        foodType: 'cafe',
        location: { x: 103.78, y: 1.29 },
      },
    })).toThrow(/foodType/)
  })

  it('outputs only canonical Food fields even when obsolete classification fields are supplied', () => {
    expect(validateVenueMap({
      cafe: {
        kind: 'food',
        name: 'Cafe',
        foodType: 'drinks & snacks',
        location: { x: 103.78, y: 1.29 },
        category: 'restaurant',
        displayName: 'Old name',
        isStandaloneEatery: true,
      },
    }).cafe).toEqual({
      kind: 'food',
      name: 'Cafe',
      foodType: 'drinks & snacks',
      location: { x: 103.78, y: 1.29 },
    })
  })
})
