import { describe, expect, it } from 'vitest'
import { getVenueSearchFields, searchVenues } from './search'

describe('searchVenues', () => {
  it('keeps a matching venue searchable when its coordinates are unavailable', () => {
    const unmappedVenue = { kind: 'room' as const, roomName: 'Unmapped tutorial room', floor: 2 }

    expect(searchVenues({ 'UNMAPPED-0201': unmappedVenue }, 'unmapped')).toEqual([
      { code: 'UNMAPPED-0201', venue: unmappedVenue },
    ])
  })

  it('searches Food by public name and Rooms by room name', () => {
    expect(getVenueSearchFields('YIH', {
      kind: 'food',
      name: 'YIH (Central Square)',
      foodType: 'canteen',
      location: { x: 103.77, y: 1.3 },
    })).toEqual(['YIH', 'YIH (Central Square)'])

    expect(getVenueSearchFields('LT17', {
      kind: 'room',
      roomName: 'Lecture Theatre 17',
    })).toEqual(['LT17', 'Lecture Theatre 17'])
  })
})
