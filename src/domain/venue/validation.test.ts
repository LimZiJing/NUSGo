import { describe, expect, it } from 'vitest'
import { validateVenueLocationMap } from './validation'

describe('validateVenueLocationMap', () => {
  it('accepts mappable and unmappable venues', () => {
    const venues = {
      COM1: {
        roomName: 'COM1',
        floor: 1,
        location: { x: 103.77, y: 1.29 },
      },
      UNKNOWN: {
        roomName: 'Unmapped venue',
        floor: null,
      },
    }

    expect(validateVenueLocationMap(venues)).toBe(venues)
  })

  it('rejects malformed venue fields with the venue code', () => {
    expect(() => validateVenueLocationMap({
      COM1: {
        roomName: '',
        location: { x: Number.NaN, y: 100 },
      },
    })).toThrowError(
      /Venue COM1 roomName must be a non-empty string; Venue COM1 has invalid longitude: NaN; Venue COM1 has invalid latitude: 100/,
    )
  })
})
