import { describe, expect, it } from 'vitest'
import { VenueValidationError, validateVenueLocationMap } from './validation'

describe('validateVenueLocationMap', () => {
  it('returns an immutable validated snapshot', () => {
    const source = {
      'COM1-0210': {
        roomName: 'Computing 1, Level 2',
        floor: 2,
        location: { x: 103.77, y: 1.3 },
      },
    }

    const venues = validateVenueLocationMap(source)
    source['COM1-0210'].roomName = 'Changed'

    expect(venues['COM1-0210'].roomName).toBe('Computing 1, Level 2')
    expect(Object.isFrozen(venues)).toBe(true)
    expect(Object.isFrozen(venues['COM1-0210'])).toBe(true)
    expect(Object.isFrozen(venues['COM1-0210'].location)).toBe(true)
  })

  it('reports malformed fields in stable venue and field order', () => {
    let error: unknown
    try {
      validateVenueLocationMap({
        'A-1': {
          roomName: ' ',
          floor: Number.NaN,
          location: { x: 181, y: Number.POSITIVE_INFINITY },
        },
        'B-1': null,
      })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(VenueValidationError)
    expect((error as VenueValidationError).issues).toEqual([
      'Venue A-1 roomName must be a non-empty string',
      'Venue A-1 floor must be a finite number, non-empty string, or null',
      'Venue A-1 has invalid longitude: 181',
      'Venue A-1 has invalid latitude: Infinity',
      'Venue B-1 must be an object',
    ])
  })
})
