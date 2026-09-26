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

describe('contextualPanelReducer', () => {
  it('starts in venue search mode', () => {
    expect(createInitialContextualPanelState()).toMatchObject({
      mode: 'venue-search',
      query: '',
      selectedVenue: null,
    })
  })

  it('keeps the venue query when opening a venue detail view and going back', () => {
    const searchState = contextualPanelReducer(
      { ...createInitialContextualPanelState(), query: 'COM1' },
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
      createInitialContextualPanelState(),
      { type: 'select-venue', result: selectedVenue },
    )
    const shuttleState = contextualPanelReducer(detailState, { type: 'open-shuttle' })

    expect(shuttleState.mode).toBe('shuttle')
    expect(contextualPanelReducer(shuttleState, { type: 'back' })).toMatchObject({
      mode: 'venue-detail',
      selectedVenue,
    })
  })

  it('returns from a selected shuttle route to route choices before Explore', () => {
    const exploreState = contextualPanelReducer(
      createInitialContextualPanelState(),
      { type: 'close' },
    )
    const routeListState = contextualPanelReducer(exploreState, { type: 'open-shuttle' })
    const routeDetailState = contextualPanelReducer(routeListState, {
      type: 'open-shuttle-route-detail',
    })

    expect(routeDetailState.mode).toBe('shuttle-route-detail')
    expect(contextualPanelReducer(routeDetailState, { type: 'back' })).toMatchObject({
      mode: 'shuttle',
    })
    expect(contextualPanelReducer(
      contextualPanelReducer(routeDetailState, { type: 'back' }),
      { type: 'back' },
    )).toMatchObject({ mode: 'neutral' })
  })

  it('escapes through history before closing to the neutral state', () => {
    const detailState = contextualPanelReducer(
      createInitialContextualPanelState(),
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

  it('returns directly to the neutral state when closed', () => {
    const detailState = contextualPanelReducer(
      { ...createInitialContextualPanelState(), query: 'COM1' },
      { type: 'select-venue', result: selectedVenue },
    )

    expect(contextualPanelReducer(detailState, { type: 'close' })).toMatchObject({
      mode: 'neutral',
      query: 'COM1',
      selectedVenue: null,
      history: [],
    })
  })

  it('closes venue detail on an empty map click', () => {
    const detailState = contextualPanelReducer(
      createInitialContextualPanelState(),
      { type: 'select-venue', result: selectedVenue },
    )

    expect(contextualPanelReducer(detailState, { type: 'map-click' })).toMatchObject({
      mode: 'neutral',
      selectedVenue: null,
    })
  })

  it('keeps shuttle browsing available when venue data is unavailable', () => {
    const neutralState = contextualPanelReducer(
      createInitialContextualPanelState(),
      { type: 'close' },
    )

    expect(contextualPanelReducer(neutralState, { type: 'open-shuttle' }).mode).toBe('shuttle')
  })
})
