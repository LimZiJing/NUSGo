import { describe, expect, it } from 'vitest'
import {
  mergeVenueAndEateryMaps,
  validateEateryLocationMap,
  validateVenueLocationMap,
  VenueValidationError,
} from './validation.ts'

describe('validateEateryLocationMap', () => {
  it('validates the category, display name, and longitude/latitude coordinates', () => {
    const eateries = validateEateryLocationMap({
      'yih-central-square': {
        name: 'YIH (Central Square)',
        category: 'canteen',
        location: { x: 103.77477, y: 1.2985 },
      },
    })

    expect(eateries['yih-central-square']).toEqual({
      name: 'YIH (Central Square)',
      category: 'canteen',
      location: { x: 103.77477, y: 1.2985 },
    })
    expect(Object.isFrozen(eateries)).toBe(true)
    expect(Object.isFrozen(eateries['yih-central-square']?.location)).toBe(true)
  })

  it('rejects missing names, unknown categories, and out-of-range coordinates', () => {
    expect(() => validateEateryLocationMap({
      broken: { name: '', category: 'canteen', location: { x: 103, y: 1 } },
    })).toThrow(VenueValidationError)
    expect(() => validateEateryLocationMap({
      broken: { name: 'A place', category: 'cafe', location: { x: 103, y: 1 } },
    })).toThrow(/category/)
    expect(() => validateEateryLocationMap({
      broken: { name: 'A place', category: 'restaurant', location: { x: 181, y: 1 } },
    })).toThrow(/longitude/)
  })
})

describe('mergeVenueAndEateryMaps', () => {
  it('reuses an existing identity by stable ID and keeps same-name destinations separate', () => {
    const venues = validateVenueLocationMap({
      Frontier: {
        roomName: 'Frontier',
        floor: 1,
        location: { x: 103.77, y: 1.29 },
      },
      'COM1-0210': { roomName: 'Seminar Room 10' },
    })
    const eateries = validateEateryLocationMap({
      'frontier-canteen': {
        name: 'Frontier',
        category: 'canteen',
        location: { x: 103.78067, y: 1.29647 },
      },
      'yih-central-square': {
        name: 'YIH (Central Square)',
        category: 'canteen',
        location: { x: 103.77477, y: 1.2985 },
      },
    })

    const merged = mergeVenueAndEateryMaps(venues, eateries)

    expect(Object.keys(merged)).toEqual(['Frontier', 'COM1-0210', 'frontier-canteen', 'yih-central-square'])
    expect(merged.Frontier).toMatchObject({
      roomName: 'Frontier',
      floor: 1,
      location: { x: 103.77, y: 1.29 },
    })
    expect(merged.Frontier?.category).toBeUndefined()
    expect(merged['frontier-canteen']).toMatchObject({
      roomName: 'Frontier',
      displayName: 'Frontier',
      category: 'canteen',
      location: { x: 103.78067, y: 1.29647 },
    })
    expect(merged['yih-central-square']).toMatchObject({
      displayName: 'YIH (Central Square)',
      category: 'canteen',
    })
    expect(merged['COM1-0210']?.roomName).toBe('Seminar Room 10')
  })

  it('reuses an existing venue when the eatery ID explicitly matches it', () => {
    const venues = validateVenueLocationMap({
      'yih-central-square': { roomName: 'Old display', floor: 0 },
    })
    const eateries = validateEateryLocationMap({
      'yih-central-square': {
        name: 'YIH (Central Square)',
        category: 'canteen',
        location: { x: 103.78067, y: 1.29647 },
      },
    })

    const merged = mergeVenueAndEateryMaps(venues, eateries)

    expect(Object.keys(merged)).toEqual(['yih-central-square'])
    expect(merged['yih-central-square']).toMatchObject({
      roomName: 'Old display',
      displayName: 'YIH (Central Square)',
      category: 'canteen',
    })
  })
})
