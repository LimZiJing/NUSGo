// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createInitialNavigationState,
  navigationReducer,
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
    setPlanLayersVisible: vi.fn(),
    dismissStopPopup: vi.fn(() => false),
    dismissMapPopup: vi.fn(() => false),
    escape: vi.fn(),
  }
}

function createOptions(isMobileViewport: boolean, activeView: NavigationState['activeView']) {
  const state = { ...createInitialNavigationState(), activeView }
  const dispatch = vi.fn<(action: NavigationAction) => void>()
  const commands = createCommands()
  const pendingViewFocusRef: { current: NavigationState['activeView'] | null } = { current: null }
  const pendingExploreReturnFocusRef: { current: HTMLElement | null } = { current: null }

  return {
    state,
    dispatch,
    commands,
    isMobileViewport,
    exploreState: { mode: 'neutral' as const, selectedVenue: null, selectedBuildingId: null },
    locationStatus: 'disabled' as const,
    pendingViewFocusRef,
    pendingExploreReturnFocusRef,
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

  it('navigates to a building as its own endpoint and opens Plan', () => {
    const options = createOptions(true, 'explore')
    const { result } = renderHook(() => useAppNavigation(options))

    act(() => result.current.navigateToBuilding('com3'))

    expect(options.commands.navigateToEndpoint).toHaveBeenCalledWith({ kind: 'building', id: 'com3' })
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

  it('opens an Explore stop in Stops and returns to its prior control', () => {
    const options = createOptions(true, 'explore')
    options.state = navigationReducer(options.state, {
      type: 'set-sheet-detent',
      view: 'stops',
      detent: 'collapsed',
    })
    const returnFocusTarget = document.createElement('button')
    const backToStops = vi.fn()
    const { result } = renderHook(() => useAppNavigation(options))

    act(() => result.current.openStopFromExplore('STOP-A', returnFocusTarget))

    expect(options.focusStop).toHaveBeenCalledWith('STOP-A')
    expect(options.pendingViewFocusRef.current).toBe('stops')
    expect(options.dispatch).toHaveBeenNthCalledWith(1, {
      type: 'set-sheet-detent',
      view: 'stops',
      detent: 'partial',
    })
    expect(options.dispatch).toHaveBeenNthCalledWith(2, { type: 'select-view', view: 'stops' })

    act(() => result.current.backFromStopDetails(backToStops))

    expect(backToStops).toHaveBeenCalledOnce()
    expect(options.pendingViewFocusRef.current).toBe('explore')
    expect(options.pendingExploreReturnFocusRef.current).toBe(returnFocusTarget)
    expect(options.dispatch).toHaveBeenLastCalledWith({ type: 'select-view', view: 'explore' })
  })

  it('returns focus to a connected Explore stop result when Back is selected', () => {
    const options = createOptions(true, 'explore')
    const stopResultButton = document.createElement('button')
    stopResultButton.dataset.focusId = 'stop-result-STOP-A'
    document.body.appendChild(stopResultButton)
    const backToStops = vi.fn()
    const { result } = renderHook(() => useAppNavigation(options))

    try {
      act(() => result.current.openStopFromExplore('STOP-A', stopResultButton))
      act(() => result.current.backFromStopDetails(backToStops))

      expect(backToStops).toHaveBeenCalledOnce()
      expect(options.pendingExploreReturnFocusRef.current).toBe(stopResultButton)
      expect(options.pendingExploreReturnFocusRef.current?.isConnected).toBe(true)
    } finally {
      stopResultButton.remove()
    }
  })

  it('keeps direct Stops details on the Stops list when Back is selected', () => {
    const options = createOptions(true, 'stops')
    const backToStops = vi.fn()
    const { result } = renderHook(() => useAppNavigation(options))

    act(() => result.current.backFromStopDetails(backToStops))

    expect(backToStops).toHaveBeenCalledOnce()
    expect(options.dispatch).not.toHaveBeenCalled()
    expect(options.pendingExploreReturnFocusRef.current).toBeNull()
  })

  it('clears Explore return context when another stop is selected from Stops', () => {
    const options = createOptions(true, 'explore')
    const { result, rerender } = renderHook(() => useAppNavigation(options))

    act(() => result.current.openStopFromExplore('STOP-A'))
    options.state = navigationReducer(options.state, { type: 'select-view', view: 'stops' })
    rerender()

    act(() => expect(result.current.handleStopSelected('STOP-B')).toBe(true))
    const backToStops = vi.fn()
    act(() => result.current.backFromStopDetails(backToStops))

    expect(backToStops).toHaveBeenCalledOnce()
    expect(options.dispatch).not.toHaveBeenCalledWith({ type: 'select-view', view: 'explore' })
    expect(options.pendingExploreReturnFocusRef.current).toBeNull()
  })

  it('keeps the stop callbacks stable when the Explore mode changes', () => {
    // App rebuilds the navigation session when these callbacks change, which resets Explore.
    let options: UseAppNavigationOptions = createOptions(true, 'explore')
    const { result, rerender } = renderHook(() => useAppNavigation(options))
    const { handleStopSelected, handleMapStopInteraction } = result.current

    options = {
      ...options,
      exploreState: { mode: 'bus-routes', selectedVenue: null, selectedBuildingId: null },
    }
    rerender()

    expect(result.current.handleStopSelected).toBe(handleStopSelected)
    expect(result.current.handleMapStopInteraction).toBe(handleMapStopInteraction)

    act(() => result.current.openStopFromExplore('STOP-A'))
    expect(result.current.stopReturnMode).toBe('bus-routes')
  })

  it('exposes the Explore return target and mode until Back is selected', () => {
    const base = createOptions(false, 'explore')
    const options = {
      ...base,
      exploreState: { mode: 'bus-routes' as const, selectedVenue: null, selectedBuildingId: null },
    }
    const { result } = renderHook(() => useAppNavigation(options))

    expect(result.current.stopReturnTarget).toBeNull()
    expect(result.current.stopReturnMode).toBeNull()

    act(() => result.current.openStopFromExplore('STOP-A'))

    expect(result.current.stopReturnTarget).toBe('explore')
    expect(result.current.stopReturnMode).toBe('bus-routes')

    act(() => result.current.backFromStopDetails(vi.fn()))

    expect(result.current.stopReturnTarget).toBeNull()
    expect(result.current.stopReturnMode).toBeNull()
  })

  it('clears the Explore return target when a stop is selected from a non-Explore view', () => {
    const options = createOptions(false, 'explore')
    const { result, rerender } = renderHook(() => useAppNavigation(options))

    act(() => result.current.openStopFromExplore('STOP-A'))
    expect(result.current.stopReturnTarget).toBe('explore')

    options.state = navigationReducer(options.state, { type: 'select-view', view: 'stops' })
    rerender()

    act(() => expect(result.current.handleStopSelected('STOP-B')).toBe(true))

    expect(result.current.stopReturnTarget).toBeNull()
    expect(result.current.stopReturnMode).toBeNull()
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

describe('map popup dismissal', () => {
  it('dismisses the active map popup when the main tab changes', () => {
    const options = createOptions(true, 'explore')
    type TestProps = {
      activeView: NavigationState['activeView']
      exploreMode: UseAppNavigationOptions['exploreState']['mode']
    }
    const initialProps: TestProps = { activeView: 'explore', exploreMode: 'neutral' }
    const { rerender } = renderHook(
      ({ activeView, exploreMode }: TestProps) => useAppNavigation({
        ...options,
        state: { ...options.state, activeView },
        exploreState: { mode: exploreMode, selectedVenue: null, selectedBuildingId: null },
      }),
      { initialProps },
    )

    expect(options.commands.dismissStopPopup).not.toHaveBeenCalled()
    rerender({ ...initialProps, exploreMode: 'bus-routes' })
    expect(options.commands.dismissStopPopup).not.toHaveBeenCalled()

    rerender({ activeView: 'plan', exploreMode: 'bus-routes' })
    expect(options.commands.dismissStopPopup).toHaveBeenCalledOnce()
    expect(options.commands.dismissMapPopup).not.toHaveBeenCalled()
    rerender({ activeView: 'stops', exploreMode: 'bus-routes' })
    expect(options.commands.dismissStopPopup).toHaveBeenCalledOnce()
    expect(options.commands.dismissMapPopup).toHaveBeenCalledOnce()
    rerender({ activeView: 'explore', exploreMode: 'bus-routes' })
    expect(options.commands.dismissStopPopup).toHaveBeenCalledTimes(2)
    expect(options.commands.dismissMapPopup).toHaveBeenCalledOnce()

    rerender({ activeView: 'explore', exploreMode: 'neutral' })
    expect(options.commands.dismissStopPopup).toHaveBeenCalledTimes(2)
    expect(options.commands.dismissMapPopup).toHaveBeenCalledOnce()
  })

  it('shows the planned Journey layers only while Plan is active', () => {
    const options = createOptions(true, 'plan')
    const { rerender } = renderHook(
      ({ activeView }: { activeView: NavigationState['activeView'] }) => useAppNavigation({
        ...options,
        state: { ...options.state, activeView },
      }),
      { initialProps: { activeView: 'plan' as NavigationState['activeView'] } },
    )
    const setPlanLayersVisible = vi.mocked(options.commands.setPlanLayersVisible)

    expect(setPlanLayersVisible).toHaveBeenLastCalledWith(true)
    rerender({ activeView: 'explore' })
    expect(setPlanLayersVisible).toHaveBeenLastCalledWith(false)
    rerender({ activeView: 'plan' })
    expect(setPlanLayersVisible).toHaveBeenLastCalledWith(true)
    rerender({ activeView: 'stops' })
    expect(setPlanLayersVisible).toHaveBeenLastCalledWith(false)
  })
})
