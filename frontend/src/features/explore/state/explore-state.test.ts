import { describe, expect, it } from 'vitest'
import {
  exploreReducer,
  createInitialExploreState,
} from './explore-state'
import type { VenueSearchResult } from '../../../domain/venue/search'

const selectedVenue: VenueSearchResult = {
  code: 'COM1-0210',
  venue: {
    roomName: 'Computing 1, Level 2',
    floor: 2,
    location: { x: 103.77, y: 1.3 },
  },
}

function createVenueSearchState() {
  return { ...createInitialExploreState(), mode: 'venue-search' as const }
}

describe('exploreReducer', () => {
  it('starts at the Explore root', () => {
    expect(createInitialExploreState()).toMatchObject({
      mode: 'neutral',
      query: '',
      selectedVenue: null,
      selectedBuildingId: null,
    })
  })

  it('opens a building detail view without a selected venue, and goes back to the search', () => {
    const searchState = { ...createVenueSearchState(), query: 'saga' }

    const detail = exploreReducer(searchState, { type: 'select-building', buildingId: 'saga-college' })

    expect(detail).toMatchObject({
      mode: 'venue-detail',
      query: 'saga',
      selectedVenue: null,
      selectedBuildingId: 'saga-college',
    })
    expect(exploreReducer(detail, { type: 'back' })).toMatchObject({
      mode: 'venue-search',
      selectedBuildingId: null,
    })
    expect(exploreReducer(detail, { type: 'map-click' })).toMatchObject({
      mode: 'neutral',
      selectedBuildingId: null,
    })
  })

  it('clears a selected building when a venue is selected', () => {
    const detail = exploreReducer(createVenueSearchState(), { type: 'select-building', buildingId: 'com1' })

    expect(exploreReducer(detail, { type: 'select-venue', result: selectedVenue })).toMatchObject({
      selectedVenue,
      selectedBuildingId: null,
    })
  })

  it('keeps the venue query when opening a venue detail view and going back', () => {
    const searchState = exploreReducer(
      { ...createVenueSearchState(), query: 'COM1' },
      { type: 'select-venue', result: selectedVenue },
    )

    expect(searchState).toMatchObject({
      mode: 'venue-detail',
      selectedVenue,
      query: 'COM1',
    })
    expect(exploreReducer(searchState, { type: 'back' })).toMatchObject({
      mode: 'venue-search',
      selectedVenue: null,
      query: 'COM1',
    })
  })

  it('returns to the previous context when entering Bus routes', () => {
    const detailState = exploreReducer(
      createVenueSearchState(),
      { type: 'select-venue', result: selectedVenue },
    )
    const busRoutesState = exploreReducer(detailState, { type: 'open-bus-routes' })

    expect(busRoutesState.mode).toBe('bus-routes')
    expect(exploreReducer(busRoutesState, { type: 'back' })).toMatchObject({
      mode: 'venue-detail',
      selectedVenue,
    })
  })

  it('escapes through history before closing to the neutral state', () => {
    const detailState = exploreReducer(
      createVenueSearchState(),
      { type: 'select-venue', result: selectedVenue },
    )
    const searchState = exploreReducer(detailState, { type: 'escape' })
    const neutralState = exploreReducer(searchState, { type: 'escape' })

    expect(searchState.mode).toBe('venue-search')
    expect(neutralState).toMatchObject({
      mode: 'neutral',
      selectedVenue: null,
      query: '',
    })
  })

  it('returns directly to the neutral state with close-to-root', () => {
    const detailState = exploreReducer(
      { ...createVenueSearchState(), query: 'COM1' },
      { type: 'select-venue', result: selectedVenue },
    )

    expect(exploreReducer(detailState, { type: 'close-to-root' })).toMatchObject({
      mode: 'neutral',
      query: 'COM1',
      selectedVenue,
      history: [],
    })
  })

  it('closes venue detail on an empty map click', () => {
    const detailState = exploreReducer(
      createVenueSearchState(),
      { type: 'select-venue', result: selectedVenue },
    )

    expect(exploreReducer(detailState, { type: 'map-click' })).toMatchObject({
      mode: 'neutral',
      selectedVenue: null,
    })
  })

  it('keeps bus route browsing available when venue data is unavailable', () => {
    const neutralState = createInitialExploreState()

    expect(exploreReducer(neutralState, { type: 'open-bus-routes' }).mode).toBe('bus-routes')
  })
})
