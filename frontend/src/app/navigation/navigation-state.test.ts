import { describe, expect, it } from 'vitest'
import {
  createInitialNavigationState,
  navigationReducer,
} from './navigation-state'

describe('shared view navigation', () => {
  it('starts every view at the partial mobile detent with Stops active', () => {
    expect(createInitialNavigationState()).toEqual({
      activeView: 'stops',
      sheets: {
        explore: { detent: 'partial', lastNonCollapsedDetent: 'partial', search: null },
        stops: { detent: 'partial', lastNonCollapsedDetent: 'partial', search: null },
        plan: { detent: 'partial', lastNonCollapsedDetent: 'partial', search: null },
      },
    })
  })

  it('remembers each view detent while the user switches views', () => {
    const fullExplore = navigationReducer(createInitialNavigationState(), {
      type: 'set-sheet-detent',
      view: 'explore',
      detent: 'full',
      source: 'manual',
    })
    const onExplore = navigationReducer(fullExplore, {
      type: 'select-view',
      view: 'explore',
    })
    const onStops = navigationReducer(onExplore, {
      type: 'select-view',
      view: 'stops',
    })
    const collapsedStops = navigationReducer(onStops, {
      type: 'set-sheet-detent',
      view: 'stops',
      detent: 'collapsed',
      source: 'manual',
    })
    const backToExplore = navigationReducer(collapsedStops, {
      type: 'select-view',
      view: 'explore',
    })

    expect(backToExplore.activeView).toBe('explore')
    expect(backToExplore.sheets.explore.detent).toBe('full')
    expect(backToExplore.sheets.stops.detent).toBe('collapsed')
  })

  it('does not change any detent when only the active view changes', () => {
    const initial = createInitialNavigationState()
    const collapsedPlan = navigationReducer(initial, {
      type: 'set-sheet-detent',
      view: 'plan',
      detent: 'collapsed',
      source: 'manual',
    })
    const next = navigationReducer(collapsedPlan, {
      type: 'select-view',
      view: 'plan',
    })

    expect(next.activeView).toBe('plan')
    expect(next.sheets).toEqual(collapsedPlan.sheets)
  })

  it('restores a collapsed Plan sheet for map selection and preserves other Plan detents', () => {
    const initiallyOpen = navigationReducer(createInitialNavigationState(), {
      type: 'set-sheet-detent',
      view: 'plan',
      detent: 'full',
      source: 'manual',
    })
    const collapsedPlan = navigationReducer(initiallyOpen, {
      type: 'set-sheet-detent',
      view: 'plan',
      detent: 'collapsed',
      source: 'manual',
    })
    const onStops = navigationReducer(collapsedPlan, { type: 'select-view', view: 'stops' })
    const planFromMap = navigationReducer(onStops, { type: 'activate-plan-from-map' })

    expect(planFromMap.activeView).toBe('plan')
    expect(planFromMap.sheets.plan.detent).toBe('full')
    expect(planFromMap.sheets.plan.lastNonCollapsedDetent).toBe('full')
    const alreadyOnCollapsedPlan = { ...onStops, activeView: 'plan' as const }
    expect(navigationReducer(alreadyOnCollapsedPlan, { type: 'activate-plan-from-map' }))
      .toBe(alreadyOnCollapsedPlan)

    const partialPlan = navigationReducer(createInitialNavigationState(), {
      type: 'set-sheet-detent',
      view: 'plan',
      detent: 'partial',
      source: 'manual',
    })
    expect(navigationReducer(partialPlan, { type: 'activate-plan-from-map' }).sheets.plan)
      .toEqual(partialPlan.sheets.plan)
  })

  it('reopens a collapsed active view at its last non-collapsed detent', () => {
    const fullStops = navigationReducer(createInitialNavigationState(), {
      type: 'set-sheet-detent',
      view: 'stops',
      detent: 'full',
      source: 'manual',
    })
    const collapsedStops = navigationReducer(fullStops, {
      type: 'set-sheet-detent',
      view: 'stops',
      detent: 'collapsed',
      source: 'manual',
    })

    expect(navigationReducer(collapsedStops, {
      type: 'select-view',
      view: 'stops',
    }).sheets.stops.detent).toBe('full')
  })

  it('opens search full-screen and restores the prior detent when dismissed', () => {
    const searching = navigationReducer(createInitialNavigationState(), {
      type: 'start-search',
      view: 'explore',
    })

    expect(searching.sheets.explore.detent).toBe('full')
    expect(navigationReducer(searching, {
      type: 'dismiss-search',
      view: 'explore',
    }).sheets.explore.detent).toBe('partial')
  })

  it('keeps a manual detent choice made during search when search is dismissed', () => {
    const searching = navigationReducer(createInitialNavigationState(), {
      type: 'start-search',
      view: 'plan',
    })
    const collapsed = navigationReducer(searching, {
      type: 'set-sheet-detent',
      view: 'plan',
      detent: 'collapsed',
      source: 'manual',
    })

    expect(navigationReducer(collapsed, {
      type: 'dismiss-search',
      view: 'plan',
    }).sheets.plan.detent).toBe('collapsed')
  })

  it('returns to the partial detent whenever a search result is selected', () => {
    const searching = navigationReducer(createInitialNavigationState(), {
      type: 'start-search',
      view: 'plan',
    })
    const manuallyCollapsed = navigationReducer(searching, {
      type: 'set-sheet-detent',
      view: 'plan',
      detent: 'collapsed',
      source: 'manual',
    })

    expect(navigationReducer(manuallyCollapsed, {
      type: 'select-search-result',
      view: 'plan',
    }).sheets.plan.detent).toBe('partial')
  })
})
