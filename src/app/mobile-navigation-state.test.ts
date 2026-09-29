import { describe, expect, it } from 'vitest'
import {
  createInitialMobileNavigationState,
  mobileNavigationReducer,
} from './mobile-navigation-state'

describe('mobile tab navigation', () => {
  it('starts every tab at the 60% partial detent', () => {
    expect(createInitialMobileNavigationState()).toEqual({
      activeTab: 'stops',
      sheets: {
        explore: { detent: 'partial', lastNonCollapsedDetent: 'partial', search: null },
        stops: { detent: 'partial', lastNonCollapsedDetent: 'partial', search: null },
        plan: { detent: 'partial', lastNonCollapsedDetent: 'partial', search: null },
      },
    })
  })

  it('remembers each tab’s detent while the user switches tabs', () => {
    const fullExplore = mobileNavigationReducer(createInitialMobileNavigationState(), {
      type: 'set-sheet-detent',
      tab: 'explore',
      detent: 'full',
      source: 'manual',
    })
    const onExplore = mobileNavigationReducer(fullExplore, {
      type: 'select-tab',
      tab: 'explore',
    })
    const onStops = mobileNavigationReducer(onExplore, {
      type: 'select-tab',
      tab: 'stops',
    })
    const collapsedStops = mobileNavigationReducer(onStops, {
      type: 'set-sheet-detent',
      tab: 'stops',
      detent: 'collapsed',
      source: 'manual',
    })
    const backToExplore = mobileNavigationReducer(collapsedStops, {
      type: 'select-tab',
      tab: 'explore',
    })

    expect(backToExplore.activeTab).toBe('explore')
    expect(backToExplore.sheets.explore.detent).toBe('full')
    expect(backToExplore.sheets.stops.detent).toBe('collapsed')
  })

  it('reopens a collapsed active tab at its last non-collapsed detent', () => {
    const partialStops = mobileNavigationReducer(createInitialMobileNavigationState(), {
      type: 'set-sheet-detent',
      tab: 'stops',
      detent: 'full',
      source: 'manual',
    })
    const collapsedStops = mobileNavigationReducer(partialStops, {
      type: 'set-sheet-detent',
      tab: 'stops',
      detent: 'collapsed',
      source: 'manual',
    })

    expect(mobileNavigationReducer(collapsedStops, {
      type: 'select-tab',
      tab: 'stops',
    }).sheets.stops.detent).toBe('full')
  })

  it('opens search full-screen and restores the prior detent when dismissed', () => {
    const searching = mobileNavigationReducer(createInitialMobileNavigationState(), {
      type: 'start-search',
      tab: 'explore',
    })

    expect(searching.sheets.explore.detent).toBe('full')
    expect(mobileNavigationReducer(searching, {
      type: 'dismiss-search',
      tab: 'explore',
    }).sheets.explore.detent).toBe('partial')
  })

  it('keeps a manual detent choice made during search when search is dismissed', () => {
    const searching = mobileNavigationReducer(createInitialMobileNavigationState(), {
      type: 'start-search',
      tab: 'plan',
    })
    const collapsed = mobileNavigationReducer(searching, {
      type: 'set-sheet-detent',
      tab: 'plan',
      detent: 'collapsed',
      source: 'manual',
    })

    expect(mobileNavigationReducer(collapsed, {
      type: 'dismiss-search',
      tab: 'plan',
    }).sheets.plan.detent).toBe('collapsed')
  })

  it('returns to the 60% partial detent whenever a search result is selected', () => {
    const searching = mobileNavigationReducer(createInitialMobileNavigationState(), {
      type: 'start-search',
      tab: 'plan',
    })
    const manuallyCollapsed = mobileNavigationReducer(searching, {
      type: 'set-sheet-detent',
      tab: 'plan',
      detent: 'collapsed',
      source: 'manual',
    })

    expect(mobileNavigationReducer(manuallyCollapsed, {
      type: 'select-search-result',
      tab: 'plan',
    }).sheets.plan.detent).toBe('partial')
  })
})
