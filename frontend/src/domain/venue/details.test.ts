import { describe, expect, it } from 'vitest'
import {
  formatVenueFloorAndBuilding,
  getVenueBuildingName,
} from './details'

describe('venue details', () => {
  it('uses a confirmed building name from the venue code prefix', () => {
    expect(getVenueBuildingName('COM1-0212')).toBe('Computing 1')
    expect(getVenueBuildingName('COM3-0101')).toBe('Computing 3')
    expect(getVenueBuildingName('I3-0101')).toBe('I3 Building')
  })

  it('omits unconfirmed building names', () => {
    expect(getVenueBuildingName('BIZ2-0111')).toBeUndefined()
  })

  it('shows a present floor and confirmed building on one line', () => {
    expect(formatVenueFloorAndBuilding(2, 'Computing 1')).toBe('Floor 2 · Computing 1')
  })

  it('omits a missing floor and keeps a confirmed building name', () => {
    expect(formatVenueFloorAndBuilding(null, 'The Shaw Foundation Building'))
      .toBe('The Shaw Foundation Building')
  })

  it('omits the floor and building line when both are unavailable', () => {
    expect(formatVenueFloorAndBuilding(undefined, undefined)).toBeNull()
  })
})
