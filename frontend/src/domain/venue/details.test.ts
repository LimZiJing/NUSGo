import { describe, expect, it } from 'vitest'
import { formatVenueFloorAndBuilding } from './details'

describe('venue details', () => {
  it('shows a present floor and confirmed building on one line', () => {
    expect(formatVenueFloorAndBuilding(2, 'Computing 1')).toBe('Floor 2 · Computing 1')
  })

  it.each([
    [-1, 'Basement 1'],
    [0, 'Ground floor'],
    [1, 'Floor 1'],
  ])('formats floor %i as %s', (floor, expected) => {
    expect(formatVenueFloorAndBuilding(floor, undefined)).toBe(expected)
  })

  it('omits a missing floor and keeps a confirmed building name', () => {
    expect(formatVenueFloorAndBuilding(null, 'The Shaw Foundation Building'))
      .toBe('The Shaw Foundation Building')
  })

  it('omits the floor and building line when both are unavailable', () => {
    expect(formatVenueFloorAndBuilding(undefined, undefined)).toBeNull()
  })
})
