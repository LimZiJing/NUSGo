import { describe, expect, it } from 'vitest'
import { searchVenues } from './search'

describe('searchVenues', () => {
  it('keeps a matching venue searchable when its coordinates are unavailable', () => {
    const unmappedVenue = { roomName: 'Unmapped tutorial room', floor: 2 }

    expect(searchVenues({ 'UNMAPPED-0201': unmappedVenue }, 'unmapped')).toEqual([
      { code: 'UNMAPPED-0201', venue: unmappedVenue },
    ])
  })
})
