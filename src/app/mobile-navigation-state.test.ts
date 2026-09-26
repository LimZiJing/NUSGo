import { describe, expect, it } from 'vitest'
import {
  createInitialMobileNavigationState,
  mobileNavigationReducer,
} from './mobile-navigation-state'

describe('mobile tab navigation', () => {
  it('starts on the expanded Explore sheet with Stops compact and Plan expanded', () => {
    expect(createInitialMobileNavigationState()).toEqual({
      activeTab: 'explore',
      sheets: {
        explore: { expanded: true },
        stops: { expanded: false },
        plan: { expanded: true },
      },
    })
  })

  it('restores each tab’s previous sheet state when the user returns to it', () => {
    const planExpanded = mobileNavigationReducer(createInitialMobileNavigationState(), {
      type: 'select-tab',
      tab: 'plan',
    })
    const planCollapsed = mobileNavigationReducer(planExpanded, {
      type: 'set-sheet-expanded',
      tab: 'plan',
      expanded: false,
    })
    const exploreSelected = mobileNavigationReducer(planCollapsed, {
      type: 'select-tab',
      tab: 'explore',
    })
    const exploreExpanded = mobileNavigationReducer(exploreSelected, {
      type: 'set-sheet-expanded',
      tab: 'explore',
      expanded: true,
    })

    expect(mobileNavigationReducer(exploreExpanded, {
      type: 'select-tab',
      tab: 'plan',
    })).toEqual({
      activeTab: 'plan',
      sheets: {
        explore: { expanded: true },
        stops: { expanded: false },
        plan: { expanded: false },
      },
    })
  })

  it('closes only the active tab sheet and preserves other tab state', () => {
    const state = {
      activeTab: 'stops' as const,
      sheets: {
        explore: { expanded: true },
        stops: { expanded: true },
        plan: { expanded: false },
      },
    }

    expect(mobileNavigationReducer(state, { type: 'close-active-tab' })).toEqual({
      activeTab: 'stops',
      sheets: {
        explore: { expanded: true },
        stops: { expanded: false },
        plan: { expanded: false },
      },
    })
  })
})
