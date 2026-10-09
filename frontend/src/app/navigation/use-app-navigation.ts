import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
} from 'react'
import type { LocationTrackingStatus } from '../../domain/location/types'
import type { ExploreViewState } from '../../features/explore-view/state'
import type { NavigationSessionCommands } from '../navigation-session-mount'
import {
  createInitialNavigationState,
  navigationReducer,
  type NavigationAction,
  type NavigationState,
  type NavigationView,
} from './navigation-state'

export interface UseAppNavigationOptions {
  readonly state: NavigationState
  readonly dispatch: Dispatch<NavigationAction>
  readonly commands: Pick<
    NavigationSessionCommands,
    | 'navigateToEndpoint'
    | 'suspendMobileRoutes'
    | 'enterMobileRoutes'
    | 'enableLocationTracking'
    | 'selectMobileRoute'
    | 'focusStopInStopsTab'
    | 'dismissMapPopup'
    | 'setStopsPinVisible'
    | 'escape'
  >
  readonly isMobileViewport: boolean
  readonly exploreView: Pick<ExploreViewState, 'mode' | 'selectedVenue'>
  readonly locationStatus: LocationTrackingStatus
  readonly pendingViewFocusRef: RefObject<NavigationView | null>
  readonly focusStop: (stopId: string) => void
}

export interface AppNavigation {
  readonly state: NavigationState
  readonly dispatch: Dispatch<NavigationAction>
  readonly activeView: NavigationView
  readonly activeSheetExpanded: boolean
  readonly stopFocusRequest: { readonly stopId: string | null; readonly sequence: number }
  readonly focusStopAfterMapLayout: () => void
  readonly openStopInStopsView: (stopId: string) => void
  readonly handleStopSelected: (stopId: string) => boolean
  readonly handleMapStopInteraction: (stopId: string) => void
  readonly selectView: (view: NavigationView, stopsList?: 'nearby' | 'favourites') => void
  readonly navigateToVenue: (venueCode: string) => void
  readonly navigateToStop: (stopId: string) => void
  readonly selectRouteFromStops: (routeId: string) => void
  readonly beginMobileSearch: (view: 'explore' | 'plan') => void
  readonly dismissMobileSearch: (view: 'explore' | 'plan') => void
  readonly selectMobileSearchResult: (view: 'explore' | 'plan') => void
  readonly escapeExplore: () => void
}

export interface AppNavigationState {
  readonly state: NavigationState
  readonly dispatch: Dispatch<NavigationAction>
}

export function useAppNavigationState(): AppNavigationState {
  const [state, dispatch] = useReducer(
    navigationReducer,
    undefined,
    createInitialNavigationState,
  )
  return { state, dispatch }
}

export function useAppNavigation({
  state,
  dispatch,
  commands,
  isMobileViewport,
  exploreView,
  locationStatus,
  pendingViewFocusRef,
  focusStop,
}: UseAppNavigationOptions): AppNavigation {
  const navigationRef = useRef(state)
  const isMobileViewportRef = useRef(isMobileViewport)
  const [stopFocusRequest, setStopFocusRequest] = useState<{
    readonly stopId: string | null
    readonly sequence: number
  }>({ stopId: null, sequence: 0 })
  const handledStopFocusRequestRef = useRef(0)
  const previousExploreViewRef = useRef<Pick<ExploreViewState, 'mode' | 'selectedVenue'> | null>(null)

  const activeView = state.activeView
  const activeSheetDetent = state.sheets[activeView].detent
  const activeSheetExpanded = activeSheetDetent !== 'collapsed'

  useLayoutEffect(() => {
    navigationRef.current = state
    isMobileViewportRef.current = isMobileViewport
  }, [isMobileViewport, state])

  const openStopInStopsView = useCallback((stopId: string): void => {
    focusStop(stopId)
    setStopFocusRequest((current) => ({ stopId, sequence: current.sequence + 1 }))
    if (navigationRef.current.activeView !== 'stops') {
      pendingViewFocusRef.current = 'stops'
      dispatch({ type: 'select-view', view: 'stops' })
    }
  }, [dispatch, focusStop, pendingViewFocusRef])

  const handleStopSelected = useCallback((stopId: string): boolean => {
    const currentNavigation = navigationRef.current
    if (isMobileViewportRef.current && currentNavigation.activeView !== 'stops') return false

    openStopInStopsView(stopId)
    if (
      isMobileViewportRef.current &&
      currentNavigation.sheets.stops.detent === 'collapsed'
    ) {
      dispatch({ type: 'set-sheet-detent', view: 'stops', detent: 'partial' })
    }
    return true
  }, [dispatch, openStopInStopsView])

  const handleMapStopInteraction = useCallback((stopId: string): void => {
    if (isMobileViewportRef.current) return
    openStopInStopsView(stopId)
  }, [openStopInStopsView])

  const selectView = useCallback((
    view: NavigationView,
    stopsList?: 'nearby' | 'favourites',
  ): void => {
    const currentNavigation = state
    if (!isMobileViewport && view === currentNavigation.activeView) return
    const switchingView = view !== currentNavigation.activeView
    const reopeningCollapsedView = !switchingView && activeSheetDetent === 'collapsed'
    if (isMobileViewport && (switchingView || reopeningCollapsedView)) {
      if (switchingView && currentNavigation.sheets[currentNavigation.activeView].search) {
        dispatch({ type: 'dismiss-search', view: currentNavigation.activeView })
      }
      if (switchingView && currentNavigation.activeView === 'explore' && exploreView.mode === 'shuttle') {
        commands.suspendMobileRoutes()
      } else if (switchingView && view === 'explore' && exploreView.mode === 'shuttle') {
        commands.enterMobileRoutes()
      }
    }
    if (view === 'stops' && stopsList === 'nearby' && locationStatus === 'disabled') {
      commands.enableLocationTracking()
    }
    dispatch({ type: 'select-view', view })
  }, [
    activeSheetDetent,
    commands,
    dispatch,
    exploreView.mode,
    isMobileViewport,
    locationStatus,
    state,
  ])

  const navigateToEndpoint = useCallback((
    endpoint: Parameters<NavigationSessionCommands['navigateToEndpoint']>[0],
  ): void => {
    commands.navigateToEndpoint(endpoint)
    pendingViewFocusRef.current = 'plan'
    dispatch(isMobileViewport
      ? { type: 'open-plan' }
      : { type: 'select-view', view: 'plan' })
  }, [commands, dispatch, isMobileViewport, pendingViewFocusRef])

  const navigateToVenue = useCallback((venueCode: string): void => {
    navigateToEndpoint({ kind: 'venue', id: venueCode })
  }, [navigateToEndpoint])

  const navigateToStop = useCallback((stopId: string): void => {
    navigateToEndpoint({ kind: 'stop', id: stopId })
  }, [navigateToEndpoint])

  const selectRouteFromStops = useCallback((routeId: string): void => {
    if (isMobileViewport) {
      dispatch({ type: 'set-sheet-detent', view: 'explore', detent: 'partial' })
    }
    commands.enterMobileRoutes()
    commands.selectMobileRoute(routeId)
    pendingViewFocusRef.current = 'explore'
    dispatch({ type: 'select-view', view: 'explore' })
  }, [commands, dispatch, isMobileViewport, pendingViewFocusRef])

  const beginMobileSearch = useCallback((view: 'explore' | 'plan'): void => {
    if (!isMobileViewport) return
    dispatch({ type: 'start-search', view })
  }, [dispatch, isMobileViewport])

  const dismissMobileSearch = useCallback((view: 'explore' | 'plan'): void => {
    dispatch({ type: 'dismiss-search', view })
  }, [dispatch])

  const selectMobileSearchResult = useCallback((view: 'explore' | 'plan'): void => {
    dispatch({ type: 'select-search-result', view })
  }, [dispatch])

  const escapeExplore = useCallback((): void => {
    dismissMobileSearch('explore')
    commands.escape()
  }, [commands, dismissMobileSearch])

  const focusStopAfterMapLayout = useCallback((): void => {
    if (stopFocusRequest.sequence <= handledStopFocusRequestRef.current) return
    handledStopFocusRequestRef.current = stopFocusRequest.sequence
    if (
      stopFocusRequest.stopId &&
      state.activeView === 'stops' &&
      (!isMobileViewport || state.sheets.stops.detent !== 'collapsed')
    ) commands.focusStopInStopsTab(stopFocusRequest.stopId)
  }, [commands, isMobileViewport, state, stopFocusRequest])

  useEffect(() => {
    if (!isMobileViewport || activeView === 'explore') return
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (commands.dismissMapPopup()) {
        event.preventDefault()
        return
      }
      if (!activeSheetExpanded) return
      event.preventDefault()
      dispatch({ type: 'close-active-view' })
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [activeSheetExpanded, activeView, commands, dispatch, isMobileViewport])

  useEffect(() => {
    const previous = previousExploreViewRef.current
    previousExploreViewRef.current = exploreView
    if (!previous) return
    const modeChanged = previous.mode !== exploreView.mode
    const venueChanged = previous.selectedVenue?.code !== exploreView.selectedVenue?.code
    if (
      (modeChanged || venueChanged) && isMobileViewport &&
      state.activeView === 'explore' && state.sheets.explore.detent === 'collapsed'
    ) {
      dispatch({ type: 'set-sheet-detent', view: 'explore', detent: 'partial' })
    }
  }, [dispatch, exploreView, isMobileViewport, state.activeView, state.sheets.explore.detent])

  useLayoutEffect(() => {
    commands.setStopsPinVisible(activeView === 'stops')
  }, [activeView, commands])

  useEffect(() => {
    if (activeView === 'stops') commands.dismissMapPopup()
  }, [activeView, commands])

  return {
    state,
    dispatch,
    activeView,
    activeSheetExpanded,
    stopFocusRequest,
    focusStopAfterMapLayout,
    openStopInStopsView,
    handleStopSelected,
    handleMapStopInteraction,
    selectView,
    navigateToVenue,
    navigateToStop,
    selectRouteFromStops,
    beginMobileSearch,
    dismissMobileSearch,
    selectMobileSearchResult,
    escapeExplore,
  }
}
