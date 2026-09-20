import { describe, expect, it } from 'vitest'
import {
  createInitialMobileOverlayState,
  mobileOverlayReducer,
} from './mobile-overlay-state'

describe('mobile overlay coordination', () => {
  it('minimizes the contextual sheet when the trip card expands', () => {
    expect(mobileOverlayReducer(createInitialMobileOverlayState(), {
      type: 'set-trip-expanded',
      expanded: true,
    })).toEqual({
      tripExpanded: true,
      contextualPanelMinimized: true,
    })
  })

  it('restores the sheet and collapses the trip card without changing contextual state', () => {
    expect(mobileOverlayReducer({
      tripExpanded: true,
      contextualPanelMinimized: true,
    }, { type: 'restore-contextual-panel' })).toEqual({
      tripExpanded: false,
      contextualPanelMinimized: false,
    })
  })

  it('reveals the sheet after a map-driven contextual state change', () => {
    expect(mobileOverlayReducer({
      tripExpanded: true,
      contextualPanelMinimized: true,
    }, { type: 'contextual-state-changed' })).toEqual({
      tripExpanded: false,
      contextualPanelMinimized: false,
    })
  })

  it('clears mobile-only presentation state when crossing the desktop breakpoint', () => {
    const mobileState = {
      tripExpanded: true,
      contextualPanelMinimized: true,
    }

    expect(mobileOverlayReducer(mobileState, {
      type: 'viewport-changed',
      isMobile: false,
    })).toEqual({
      tripExpanded: false,
      contextualPanelMinimized: false,
    })

    expect(mobileOverlayReducer(mobileState, {
      type: 'viewport-changed',
      isMobile: true,
    })).toEqual({
      tripExpanded: false,
      contextualPanelMinimized: false,
    })
  })
})
