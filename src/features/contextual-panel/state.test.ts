import { describe, expect, it } from 'vitest'
import {
  contextualPanelReducer,
  createInitialContextualPanelState,
} from './state'
import type { VenueSearchResult } from '../../domain/venue/search'

const selectedVenue: VenueSearchResult = {
  code: 'COM1-0210',
  venue: {
    roomName: 'Computing 1, Level 2',
    floor: 2,
    location: { x: 103.77, y: 1.3 },
  },
}

function createVenueSearchState() {
  return { ...createInitialContextualPanelState(), mode: 'venue-search' as const }
}

describe('contextualPanelReducer', () => {
  it('starts at the Explore root', () => {
    expect(createInitialContextualPanelState()).toMatchObject({
      mode: 'neutral',
      query: '',
      selectedVenue: null,
    })
  })

  it('keeps the venue query when opening a venue detail view and going back', () => {
    const searchState = contextualPanelReducer(
      { ...createVenueSearchState(), query: 'COM1' },
      { type: 'select-venue', result: selectedVenue },
    )

    expect(searchState).toMatchObject({
      mode: 'venue-detail',
      selectedVenue,
      query: 'COM1',
    })
    expect(contextualPanelReducer(searchState, { type: 'back' })).toMatchObject({
      mode: 'venue-search',
      selectedVenue: null,
      query: 'COM1',
    })
  })

  it('returns to the previous context when entering shuttle mode', () => {
    const detailState = contextualPanelReducer(
      createVenueSearchState(),
      { type: 'select-venue', result: selectedVenue },
    )
    const shuttleState = contextualPanelReducer(detailState, { type: 'open-shuttle' })

    expect(shuttleState.mode).toBe('shuttle')
    expect(contextualPanelReducer(shuttleState, { type: 'back' })).toMatchObject({
      mode: 'venue-detail',
      selectedVenue,
    })
  })

  it('escapes through history before closing to the neutral state', () => {
    const detailState = contextualPanelReducer(
      createVenueSearchState(),
      { type: 'select-venue', result: selectedVenue },
    )
    const searchState = contextualPanelReducer(detailState, { type: 'escape' })
    const neutralState = contextualPanelReducer(searchState, { type: 'escape' })

    expect(searchState.mode).toBe('venue-search')
    expect(neutralState).toMatchObject({
      mode: 'neutral',
      selectedVenue: null,
      query: '',
    })
  })

  it('returns directly to the neutral state with close-to-root', () => {
    const detailState = contextualPanelReducer(
      { ...createVenueSearchState(), query: 'COM1' },
      { type: 'select-venue', result: selectedVenue },
    )

    expect(contextualPanelReducer(detailState, { type: 'close-to-root' })).toMatchObject({
      mode: 'neutral',
      query: 'COM1',
      selectedVenue: null,
      history: [],
    })
  })

  it('closes venue detail on an empty map click', () => {
    const detailState = contextualPanelReducer(
      createVenueSearchState(),
      { type: 'select-venue', result: selectedVenue },
    )

    expect(contextualPanelReducer(detailState, { type: 'map-click' })).toMatchObject({
      mode: 'neutral',
      selectedVenue: null,
    })
  })

  it('keeps shuttle browsing available when venue data is unavailable', () => {
    const neutralState = createInitialContextualPanelState()

    expect(contextualPanelReducer(neutralState, { type: 'open-shuttle' }).mode).toBe('shuttle')
  })
})
