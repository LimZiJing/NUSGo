import { describe, expect, it } from 'vitest'
import { getVenueSearchFields, searchVenues } from './search'

describe('searchVenues', () => {
  it('keeps a matching venue searchable when its coordinates are unavailable', () => {
    const unmappedVenue = { roomName: 'Unmapped tutorial room', floor: 2 }

    expect(searchVenues({ 'UNMAPPED-0201': unmappedVenue }, 'unmapped')).toEqual([
      { code: 'UNMAPPED-0201', venue: unmappedVenue },
    ])
  })

  it('includes distinct display and room names without repeating identical names', () => {
    expect(getVenueSearchFields('YIH', {
      roomName: 'YIH (Central Square)',
      displayName: 'YIH (Central Square)',
    })).toEqual(['YIH', 'YIH (Central Square)'])

    expect(getVenueSearchFields('LT17', {
      roomName: 'Lecture Theatre 17',
      displayName: 'LT17',
    })).toEqual(['LT17', 'LT17', 'Lecture Theatre 17'])
  })
})
