// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createInitialNavigationState,
  type NavigationAction,
  type NavigationState,
} from './navigation-state'
import { useAppNavigation, type UseAppNavigationOptions } from './use-app-navigation'

afterEach(cleanup)

function createCommands(): UseAppNavigationOptions['commands'] {
  return {
    navigateToEndpoint: vi.fn(),
    suspendMobileRoutes: vi.fn(),
    enterMobileRoutes: vi.fn(),
    enableLocationTracking: vi.fn(),
    selectMobileRoute: vi.fn(),
    focusStopInStopsTab: vi.fn(),
    setStopsPinVisible: vi.fn(),
    dismissMapPopup: vi.fn(() => false),
    escape: vi.fn(),
  }
}

function createOptions(isMobileViewport: boolean, activeView: NavigationState['activeView']) {
  const state = { ...createInitialNavigationState(), activeView }
  const dispatch = vi.fn<(action: NavigationAction) => void>()
  const commands = createCommands()
  const pendingViewFocusRef: { current: NavigationState['activeView'] | null } = { current: null }

  return {
    state,
    dispatch,
    commands,
    isMobileViewport,
    exploreView: { mode: 'neutral' as const, selectedVenue: null },
    locationStatus: 'disabled' as const,
    pendingViewFocusRef,
    focusStop: vi.fn(),
  }
}

describe('useAppNavigation', () => {
  it('navigates to a venue and opens Plan on mobile', () => {
    const options = createOptions(true, 'explore')
    const { result } = renderHook(() => useAppNavigation(options))

    act(() => result.current.navigateToVenue('COM1'))

    expect(options.commands.navigateToEndpoint).toHaveBeenCalledWith({ kind: 'venue', id: 'COM1' })
    expect(options.pendingViewFocusRef.current).toBe('plan')
    expect(options.dispatch).toHaveBeenCalledWith({ type: 'open-plan' })
  })

  it('navigates to a stop and selects Plan on desktop', () => {
    const options = createOptions(false, 'stops')
    const { result } = renderHook(() => useAppNavigation(options))

    act(() => result.current.navigateToStop('STOP-A'))

    expect(options.commands.navigateToEndpoint).toHaveBeenCalledWith({ kind: 'stop', id: 'STOP-A' })
    expect(options.pendingViewFocusRef.current).toBe('plan')
    expect(options.dispatch).toHaveBeenCalledWith({ type: 'select-view', view: 'plan' })
  })

  it('coordinates mobile route selection from Stops with Explore navigation', () => {
    const options = createOptions(true, 'stops')
    const { result } = renderHook(() => useAppNavigation(options))

    act(() => result.current.selectRouteFromStops('ROUTE-A'))

    expect(options.commands.enterMobileRoutes).toHaveBeenCalledOnce()
    expect(options.commands.selectMobileRoute).toHaveBeenCalledWith('ROUTE-A')
    expect(options.pendingViewFocusRef.current).toBe('explore')
    expect(options.dispatch).toHaveBeenNthCalledWith(1, {
      type: 'set-sheet-detent',
      view: 'explore',
      detent: 'partial',
    })
    expect(options.dispatch).toHaveBeenNthCalledWith(2, { type: 'select-view', view: 'explore' })
  })
})
