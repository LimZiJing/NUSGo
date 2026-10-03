import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  ExploreView,
  getExploreShellClassName,
} from '../features/contextual-panel/explore-view'
import {
  StopsView,
  type StopSheetSelection,
} from '../features/shuttle-browsing/stops-view'
import { getStopSheetSelection } from '../features/shuttle-browsing/stops-view-state'
import {
  getStopsOverview,
  getStopsWithinNearbyRadius,
} from '../features/shuttle-browsing/stops-overview'
import { useStopsView } from '../features/shuttle-browsing/use-stops-view'
import { useStopsArrivals } from '../features/shuttle-browsing/use-stops-arrivals'
import { LocationControl } from '../ui/location-control'
import { isFocusInsideLocationControl } from '../ui/location-control-focus'
import { MainNavigation } from '../ui/main-navigation'
import { DesktopColumnShell } from '../ui/desktop-column-shell'
import { MobileSheetShell } from '../ui/mobile-sheet-shell'
import { animateMobileSheet } from '../ui/animate-mobile-sheet'
import { getMobileSheetHeights, getMobileTabBarInset } from '../ui/mobile-sheet-layout'
import { PlanView } from '../features/trip-endpoints/plan-view'
import { ShuttleRouteControl } from '../features/shuttle-browsing/shuttle-route-control'
import { createNavigationSession, type NavigationSession } from './navigation-session'
import {
  createNavigationSessionCommandAdapter,
  createNavigationSessionMount,
} from './navigation-session-mount'
import { useNavigationSession } from './use-navigation-session'
import { deriveContextualPanelStatus } from './contextual-panel-status'
import {
  createInitialNavigationState,
  getIsMobileViewport,
  navigationReducer,
  subscribeToMobileViewport,
  type NavigationView,
} from './navigation-state'
import type { MapViewportInsets } from './map-camera'
import { applyMapOverlayMeasurements } from './map-insets-controller'
import { loadTransitMapData, loadVenueData } from '../infrastructure/data/loaders'
import { createMapSession } from '../infrastructure/map/session'
import { createValhallaRouteEngine } from '../infrastructure/routing/valhalla'
import { createWalkingConnectionProvider } from '../infrastructure/routing/walking-connections'
import { getValhallaBaseUrl } from './routing-config'
import { createJourneyPlanningService } from './journey-planning'
import { createShuttleArrivalClient } from '../infrastructure/shuttle-arrivals/client'
import { createShuttleServiceHoursClient } from '../infrastructure/shuttle-service-hours/client'
import { createBrowserLocationTracker } from '../infrastructure/location/browser'
import { isValidLocationCoordinates } from '../domain/location/coordinates'
import type { LocationTrackingState } from '../domain/location/types'
import { useStopsServiceWindows } from '../features/shuttle-browsing/use-stops-service-windows'
import { applyTheme, getSystemTheme, type Theme } from '../ui/theme'
import { ThemeToggle } from '../ui/theme-toggle'
import { JourneyTestTimeControl } from '../ui/journey-test-time-control'
import { createJourneyTestClockStore } from './journey-test-clock-store'

function hasSuccessfulLocation(location: LocationTrackingState): boolean {
  const fix = location.latestFix
  return location.status === 'tracking' && fix !== null && isValidLocationCoordinates(
    fix.longitude,
    fix.latitude,
  )
}

function App() {
  const mapShellRef = useRef<HTMLElement>(null)
  const mapContainer = useRef<HTMLDivElement>(null)
  const navigationColumnRef = useRef<HTMLElement>(null)
  const locationControlRef = useRef<HTMLDivElement>(null)
  const tripControlsRef = useRef<HTMLElement>(null)
  const contextualPanelRef = useRef<HTMLElement>(null)
  const stopsSheetRef = useRef<HTMLElement>(null)
  const mainNavigationRef = useRef<HTMLElement>(null)
  const [session, setSession] = useState<NavigationSession | null>(null)
  const [theme, setTheme] = useState<Theme>(getSystemTheme)
  const [simulatedAtMs, setSimulatedAtMs] = useState<number | null>(null)
  const [testClock] = useState(createJourneyTestClockStore)
  const state = useNavigationSession(session)
  const panelStatus = deriveContextualPanelStatus(
    state.resourceStatus,
    state.mapError,
    state.startupFailure,
  )
  const [navigation, dispatchNavigation] = useReducer(
    navigationReducer,
    undefined,
    createInitialNavigationState,
  )
  const [navigationColumnWidth, setNavigationColumnWidth] = useState(0)
  const [isMobileViewport, setIsMobileViewport] = useState(getIsMobileViewport)
  const navigationRef = useRef(navigation)
  const pendingViewFocusRef = useRef<NavigationView | null>(null)
  const isMobileViewportRef = useRef(isMobileViewport)
  const prepareSheetTransitionRef = useRef<(() => void) | null>(null)
  const [stopsView, dispatchStopsView] = useStopsView(state.transitIndex)
  const [mapCenter, setMapCenter] = useState<{ longitude: number; latitude: number } | null>(null)
  const [stopFocusRequest, setStopFocusRequest] = useState<{
    readonly stopId: string | null
    readonly sequence: number
  }>({ stopId: null, sequence: 0 })
  const handledStopFocusRequestRef = useRef(0)
  const initialNearbyLocationRequestedRef = useRef(false)
  const pendingNearbyTimingExpansionRef = useRef(false)
  const [mapInsets, setMapInsets] = useState<MapViewportInsets>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })
  const previousContextualStateRef = useRef<typeof state.contextualPanel | null>(null)
  const focusTripControlAfterOverlayRef = useRef(false)
  const pendingSheetTransitionRef = useRef<{
    startHeight: number
    startBottom: number
    viewChange: boolean
  } | null>(null)
  const sheetAnimationCleanupRef = useRef<(() => void) | null>(null)
  const commandAdapter = useMemo(() => createNavigationSessionCommandAdapter(), [])
  const commands = commandAdapter(session)

  const shuttleArrivalClient = useMemo(() => createShuttleArrivalClient(), [])
  const loadStopsArrivals = useCallback(
    (stops: readonly { readonly stopId: string; readonly stopName: string }[], signal: AbortSignal) => (
      shuttleArrivalClient.getArrivals(stops, signal)
    ),
    [shuttleArrivalClient],
  )
  const shuttleServiceHoursClient = useMemo(() => createShuttleServiceHoursClient(), [])
  const loadStopsServiceWindows = useCallback(
    (routeIds: readonly string[], signal: AbortSignal) => (
      shuttleServiceHoursClient.getServiceWindows(routeIds, signal)
    ),
    [shuttleServiceHoursClient],
  )
  const routeEngine = useMemo(() => createValhallaRouteEngine({
    baseUrl: getValhallaBaseUrl(import.meta.env.VITE_VALHALLA_BASE_URL, import.meta.env.DEV),
  }), [])
  const walkingConnectionProvider = useMemo(() => createWalkingConnectionProvider({
    routeEngine,
  }), [routeEngine])
  const journeyPlanner = useMemo(() => createJourneyPlanningService(
    routeEngine,
    shuttleArrivalClient,
    shuttleServiceHoursClient,
    Date.now,
    walkingConnectionProvider,
    testClock.get,
  ), [routeEngine, shuttleArrivalClient, shuttleServiceHoursClient, walkingConnectionProvider, testClock])

  useEffect(() => {
    const updateViewport = (): void => {
      const isMobile = getIsMobileViewport()
      setIsMobileViewport(isMobile)
      if (!isMobile) {
        if (isFocusInsideLocationControl(locationControlRef.current)) {
          focusTripControlAfterOverlayRef.current = true
        }
      }
    }
    updateViewport()
    return subscribeToMobileViewport(updateViewport)
  }, [])

  useLayoutEffect(() => {
    const shell = mapShellRef.current
    if (!shell || !isMobileViewport) return

    const updateVisualViewport = (): void => {
      const viewport = window.visualViewport
      const viewportHeight = viewport?.height ?? window.innerHeight
      const tabBarRect = mainNavigationRef.current?.getBoundingClientRect()
      const shellBottom = shell.getBoundingClientRect().bottom
      const cssTabBarInset = Number.parseFloat(getComputedStyle(shell, '::after').height)
      const tabBarInset = getMobileTabBarInset(
        shellBottom,
        tabBarRect ? { top: tabBarRect.top, height: tabBarRect.height } : null,
        cssTabBarInset,
      )
      const sheetHeights = getMobileSheetHeights(viewportHeight, tabBarInset)
      shell.style.setProperty(
        '--mobile-viewport-height',
        `${sheetHeights.viewportHeight}px`,
      )
      shell.style.setProperty('--mobile-sheet-max-height', `${sheetHeights.partialMaxHeight}px`)
      shell.style.setProperty('--mobile-sheet-min-height', `${sheetHeights.partialMinHeight}px`)
      if (tabBarInset > 0) {
        shell.style.setProperty('--mobile-tab-bar-height', `${tabBarInset}px`)
      }
      shell.style.setProperty(
        '--mobile-viewport-offset-top',
        `${viewport?.offsetTop ?? 0}px`,
      )
    }

    updateVisualViewport()
    window.addEventListener('resize', updateVisualViewport)
    window.visualViewport?.addEventListener('resize', updateVisualViewport)
    window.visualViewport?.addEventListener('scroll', updateVisualViewport)
    return () => {
      window.removeEventListener('resize', updateVisualViewport)
      window.visualViewport?.removeEventListener('resize', updateVisualViewport)
      window.visualViewport?.removeEventListener('scroll', updateVisualViewport)
      shell.style.removeProperty('--mobile-viewport-height')
      shell.style.removeProperty('--mobile-sheet-max-height')
      shell.style.removeProperty('--mobile-sheet-min-height')
      shell.style.removeProperty('--mobile-tab-bar-height')
      shell.style.removeProperty('--mobile-viewport-offset-top')
    }
  }, [isMobileViewport])

  const activeView = navigation.activeView
  const activeSheetDetent = navigation.sheets[activeView].detent
  const activeSheetExpanded = activeSheetDetent !== 'collapsed'
  const dismissMapPopup = commands.dismissMapPopup

  useLayoutEffect(() => {
    if (pendingViewFocusRef.current !== activeView) return
    pendingViewFocusRef.current = null
    const root = activeView === 'explore'
      ? contextualPanelRef.current
      : activeView === 'stops'
        ? stopsSheetRef.current
        : tripControlsRef.current
    const target = root?.querySelector<HTMLElement>(
      'h2[tabindex="-1"], h3[tabindex="-1"], input:not([disabled]), select:not([disabled]), button:not([disabled])',
    )
    target?.focus()
  }, [activeView])

  const getActiveMobileSheet = useCallback((): HTMLElement | null => {
    if (navigation.activeView === 'plan') return tripControlsRef.current
    if (navigation.activeView === 'stops') return stopsSheetRef.current
    return contextualPanelRef.current
  }, [navigation.activeView])

  useLayoutEffect(() => {
    navigationRef.current = navigation
    isMobileViewportRef.current = isMobileViewport
  }, [isMobileViewport, navigation])

  const prepareSheetTransition = useCallback((viewChange = false): void => {
    if (!isMobileViewport) return
    sheetAnimationCleanupRef.current?.()
    sheetAnimationCleanupRef.current = null
    const sheet = getActiveMobileSheet()
    const startHeight = sheet?.getBoundingClientRect().height ?? 0
    const startBottom = sheet ? Number.parseFloat(window.getComputedStyle(sheet).bottom) : 0
    pendingSheetTransitionRef.current = sheet
      ? { startHeight, startBottom: Number.isFinite(startBottom) ? startBottom : 0, viewChange }
      : null
  }, [getActiveMobileSheet, isMobileViewport])

  useLayoutEffect(() => {
    prepareSheetTransitionRef.current = () => prepareSheetTransition()
  }, [prepareSheetTransition])

  const openStopInStopsView = useCallback((stopId: string): void => {
    dispatchStopsView({ type: 'focus-stop', stopId })
    setStopFocusRequest((current) => ({ stopId, sequence: current.sequence + 1 }))
    if (navigationRef.current.activeView !== 'stops') {
      pendingViewFocusRef.current = 'stops'
      dispatchNavigation({ type: 'select-view', view: 'stops' })
    }
  }, [dispatchStopsView])

  const handleStopSelected = useCallback((stopId: string): boolean => {
    const currentNavigation = navigationRef.current
    if (
      isMobileViewportRef.current &&
      currentNavigation.activeView !== 'stops'
    ) return false

    openStopInStopsView(stopId)
    if (
      isMobileViewportRef.current &&
      currentNavigation.sheets.stops.detent === 'collapsed'
    ) {
      prepareSheetTransitionRef.current?.()
      dispatchNavigation({ type: 'set-sheet-detent', view: 'stops', detent: 'partial' })
    }
    return true
  }, [openStopInStopsView])

  const handleMapStopInteraction = useCallback((stopId: string): void => {
    if (isMobileViewportRef.current) return
    openStopInStopsView(stopId)
  }, [openStopInStopsView])

  useEffect(() => {
    if (!isMobileViewport || activeView === 'explore') return

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (dismissMapPopup()) {
        event.preventDefault()
        return
      }
      if (!activeSheetExpanded) return
      event.preventDefault()
      dispatchNavigation({ type: 'close-active-view' })
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [
    activeSheetExpanded,
    activeView,
    dismissMapPopup,
    isMobileViewport,
  ])

  useEffect(() => {
    const previous = previousContextualStateRef.current
    previousContextualStateRef.current = state.contextualPanel
    if (!previous) return
    const modeChanged = previous.mode !== state.contextualPanel.mode
    const venueChanged = previous.selectedVenue?.code !== state.contextualPanel.selectedVenue?.code
    if (
      (modeChanged || venueChanged) &&
      isMobileViewport &&
      navigation.activeView === 'explore' &&
      navigation.sheets.explore.detent === 'collapsed'
    ) {
      dispatchNavigation({ type: 'set-sheet-detent', view: 'explore', detent: 'partial' })
    }
  }, [
    isMobileViewport,
    navigation.activeView,
    navigation.sheets.explore.detent,
    state.contextualPanel,
  ])

  useLayoutEffect(() => {
    commands.setStopsPinVisible(activeView === 'stops')
  }, [activeView, commands])

  useLayoutEffect(() => {
    const updateInsets = (): void => {
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const activeSheetHeight = navigation.activeView === 'plan'
        ? tripControlsRef.current?.getBoundingClientRect().height ?? 0
        : navigation.activeView === 'stops'
          ? stopsSheetRef.current?.getBoundingClientRect().height ?? 0
          : contextualPanelRef.current?.getBoundingClientRect().height ?? 0
      const tabBarRect = mainNavigationRef.current?.getBoundingClientRect()
      const mapShellBottom = mapShellRef.current?.getBoundingClientRect().bottom ?? viewportHeight
      const mapShell = mapShellRef.current
      const measuredNavigationWidth = isMobileViewport
        ? 0
        : navigationColumnRef.current?.getBoundingClientRect().width ?? 0
      setNavigationColumnWidth((current) => (
        current === measuredNavigationWidth ? current : measuredNavigationWidth
      ))
      const cssTabBarInset = mapShell
        ? Number.parseFloat(getComputedStyle(mapShell, '::after').height)
        : 0
      const tabBarInset = getMobileTabBarInset(
        mapShellBottom,
        tabBarRect ? { top: tabBarRect.top, height: tabBarRect.height } : null,
        cssTabBarInset,
      )
      const nextInsets = applyMapOverlayMeasurements(commands, {
        viewportWidth,
        viewportHeight,
        tripCardHeight: 0,
        contextualSheetHeight: activeSheetHeight + tabBarInset,
        tripCardVisible: false,
        contextualSheetVisible: isMobileViewport,
        desktopNavigationWidth: measuredNavigationWidth,
      })
      setMapInsets((current) => (
        current.top === nextInsets.top &&
        current.right === nextInsets.right &&
        current.bottom === nextInsets.bottom &&
        current.left === nextInsets.left
          ? current
          : nextInsets
      ))
      if (stopFocusRequest.sequence > handledStopFocusRequestRef.current) {
        handledStopFocusRequestRef.current = stopFocusRequest.sequence
        if (
          stopFocusRequest.stopId &&
          navigation.activeView === 'stops' &&
          (!isMobileViewport || navigation.sheets.stops.detent !== 'collapsed')
        ) commands.focusStopInStopsTab(stopFocusRequest.stopId)
      }
    }

    updateInsets()
    window.addEventListener('resize', updateInsets)
    window.visualViewport?.addEventListener('resize', updateInsets)
    window.visualViewport?.addEventListener('scroll', updateInsets)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateInsets)
    if (tripControlsRef.current) resizeObserver?.observe(tripControlsRef.current)
    if (contextualPanelRef.current) resizeObserver?.observe(contextualPanelRef.current)
    if (stopsSheetRef.current) resizeObserver?.observe(stopsSheetRef.current)
    if (mainNavigationRef.current) resizeObserver?.observe(mainNavigationRef.current)
    if (navigationColumnRef.current) resizeObserver?.observe(navigationColumnRef.current)

    return () => {
      window.removeEventListener('resize', updateInsets)
      window.visualViewport?.removeEventListener('resize', updateInsets)
      window.visualViewport?.removeEventListener('scroll', updateInsets)
      resizeObserver?.disconnect()
    }
  }, [
    commands,
    isMobileViewport,
    navigation.activeView,
    navigation.sheets.explore.detent,
    navigation.sheets.plan.detent,
    navigation.sheets.stops.detent,
    activeSheetDetent,
    state.contextualPanel.mode,
    state.contextualPanel.selectedVenue?.code,
    state.selectedRouteId,
    stopFocusRequest,
  ])

  useLayoutEffect(() => {
    const pending = pendingSheetTransitionRef.current
    if (!pending || !isMobileViewport) return
    pendingSheetTransitionRef.current = null
    const sheet = getActiveMobileSheet()
    if (!sheet) return

    const cleanup = animateMobileSheet(
      sheet,
      pending.startHeight,
      pending.viewChange,
      pending.startBottom,
    )
    sheetAnimationCleanupRef.current = cleanup
    return () => {
      cleanup()
      if (sheetAnimationCleanupRef.current === cleanup) sheetAnimationCleanupRef.current = null
    }
  }, [
    isMobileViewport,
    getActiveMobileSheet,
    navigation.activeView,
    navigation.sheets.explore.detent,
    navigation.sheets.plan.detent,
    navigation.sheets.stops.detent,
    state.contextualPanel.mode,
  ])

  useLayoutEffect(() => {
    if (!focusTripControlAfterOverlayRef.current) return
    focusTripControlAfterOverlayRef.current = false
    const focusTarget = tripControlsRef.current?.querySelector<HTMLElement>(
      '.trip-controls-body input:not([disabled]), .trip-controls-body select:not([disabled]), .trip-controls-body textarea:not([disabled]), .mobile-sheet-handle',
    )
    focusTarget?.focus()
  }, [isMobileViewport, navigation.sheets.plan.detent])

  useEffect(() => {
    if (!mapContainer.current) return

    const mount = createNavigationSessionMount(mapContainer.current, {
      createMapSession,
      createNavigationSession,
      loadVenues: loadVenueData,
      loadTransit: loadTransitMapData,
      journeyPlanner,
      locationTracker: createBrowserLocationTracker(),
      onStopSelected: handleStopSelected,
      onMapStopInteraction: handleMapStopInteraction,
      onMapCenterChange: ([longitude, latitude]) => setMapCenter({ longitude, latitude }),
    })
    setSession(mount.session)

    return () => {
      mount.dispose()
    }
  }, [handleMapStopInteraction, handleStopSelected, journeyPlanner])

  useEffect(() => {
    if (activeView !== 'stops') return
    dismissMapPopup()
  }, [activeView, dismissMapPopup])

  const selectedRouteColor = state.selectedRouteColor ?? 'var(--bus-stop-default-color)'
  const transitIndex = state.transitIndex
  const selectedStop = stopsView.focusedStopId === null
    ? undefined
    : transitIndex?.stopById.get(stopsView.focusedStopId)
  const hasLocationError = ['denied', 'unavailable', 'timeout', 'invalid'].includes(state.location.status)
  const locationFix = hasLocationError ? null : state.location.latestFix
  const nearbyStopEntries = useMemo(() => transitIndex ? getStopsOverview(
    transitIndex,
    'nearby',
    mapCenter,
    locationFix,
    stopsView.favoriteStopIds,
  ) : [], [
    locationFix,
    mapCenter,
    stopsView.favoriteStopIds,
    transitIndex,
  ])
  const locationNearbyStopEntries = useMemo(() => {
    if (!transitIndex || !locationFix) return null
    return getStopsWithinNearbyRadius(transitIndex, locationFix, locationFix)
  }, [locationFix, transitIndex])
  const overviewStopEntries = useMemo(() => stopsView.list === 'nearby'
    ? nearbyStopEntries
    : transitIndex ? getStopsOverview(
      transitIndex,
      'favourites',
      mapCenter,
      locationFix,
      stopsView.favoriteStopIds,
    ) : [], [
    locationFix,
    mapCenter,
    stopsView.favoriteStopIds,
    stopsView.list,
    nearbyStopEntries,
    transitIndex,
  ])
  const arrivalStopRequests = useMemo(() => {
    const requests = new Map<string, { readonly stopId: string; readonly stopName: string }>()
    for (const { stop } of overviewStopEntries) {
      requests.set(stop.id, { stopId: stop.id, stopName: stop.longName })
    }
    if (selectedStop) {
      requests.set(selectedStop.id, { stopId: selectedStop.id, stopName: selectedStop.longName })
    }
    return [...requests.values()]
  }, [overviewStopEntries, selectedStop])
  const stopArrivals = useStopsArrivals(
    loadStopsArrivals,
    activeView === 'stops',
    arrivalStopRequests,
  )
  const serviceRouteIds = useMemo(() => {
    const routeIds = new Set<string>()
    for (const { stopId } of arrivalStopRequests) {
      for (const routeId of transitIndex?.routeIdsByStopId.get(stopId) ?? []) routeIds.add(routeId)
    }
    return [...routeIds].sort()
  }, [arrivalStopRequests, transitIndex])
  const stopServiceWindows = useStopsServiceWindows(
    loadStopsServiceWindows,
    activeView === 'stops',
    serviceRouteIds,
  )
  const stopArrivalsUpdating = stopArrivals.status === 'refreshing' || stopArrivals.status === 'error'
  const stopSelection: StopSheetSelection | null = selectedStop && transitIndex
    ? getStopSheetSelection(
      selectedStop,
      transitIndex,
      stopsView.favoriteStopIds,
      stopArrivals.snapshot,
      stopArrivals.nowMs,
      stopServiceWindows.windows,
      stopArrivalsUpdating,
    )
    : null
  const overviewStops = transitIndex ? overviewStopEntries.map(({ stop, distanceMeters }) => ({
    stop: getStopSheetSelection(
      stop,
      transitIndex,
      stopsView.favoriteStopIds,
      stopArrivals.snapshot,
      stopArrivals.nowMs,
      stopServiceWindows.windows,
      stopArrivalsUpdating,
    ),
    distanceMeters,
    favorite: stopsView.favoriteStopIds.includes(stop.id),
    expanded: stopsView.expandedStopIds[stopsView.list].includes(stop.id),
  })) : []
  const expandNearbyTimings = useCallback((): boolean => {
    if (locationNearbyStopEntries === null) return false
    dispatchStopsView({
      type: 'set-nearby-expanded',
      stopIds: locationNearbyStopEntries.map(({ stop }) => stop.id),
    })
    return true
  }, [dispatchStopsView, locationNearbyStopEntries])

  const tryExpandNearbyTimings = useCallback((): boolean => {
    if (!hasSuccessfulLocation(state.location) || !expandNearbyTimings()) return false
    pendingNearbyTimingExpansionRef.current = false
    return true
  }, [expandNearbyTimings, state.location])

  const requestLocationWithNearbyExpansion = useCallback((locateUser: () => void): void => {
    pendingNearbyTimingExpansionRef.current = true
    tryExpandNearbyTimings()
    locateUser()
  }, [tryExpandNearbyTimings])

  useEffect(() => {
    if (!pendingNearbyTimingExpansionRef.current) return
    if (['denied', 'unavailable', 'timeout', 'invalid'].includes(state.location.status)) {
      pendingNearbyTimingExpansionRef.current = false
      return
    }
    tryExpandNearbyTimings()
  }, [state.location, tryExpandNearbyTimings])

  useEffect(() => {
    if (
      !session || activeView !== 'stops' ||
      stopsView.list !== 'nearby' || state.location.status !== 'disabled' ||
      initialNearbyLocationRequestedRef.current
    ) return
    initialNearbyLocationRequestedRef.current = true
    requestLocationWithNearbyExpansion(session.locateUser)
  }, [
    activeView,
    stopsView.list,
    requestLocationWithNearbyExpansion,
    session,
    state.location.status,
  ])
  const locationNotice = hasLocationError && !stopsView.locationNoticeDismissed
    ? 'Location is unavailable. Showing stops near the map centre without distances.'
    : null
  const liveArrivalMessage = stopArrivals.snapshot
    ? null
    : stopArrivals.status === 'loading'
      ? 'Updating…'
      : stopArrivals.status === 'error'
        ? 'No live data'
        : null

  const beginMobileSearch = (view: 'explore' | 'plan'): void => {
    if (!isMobileViewport) return
    prepareSheetTransition(true)
    dispatchNavigation({ type: 'start-search', view })
  }
  const dismissMobileSearch = (view: 'explore' | 'plan'): void => {
    dispatchNavigation({ type: 'dismiss-search', view })
  }
  const selectMobileSearchResult = (view: 'explore' | 'plan'): void => {
    if (isMobileViewport) prepareSheetTransition(true)
    dispatchNavigation({ type: 'select-search-result', view })
  }
  const toggleTheme = useCallback((): void => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark'
      applyTheme(nextTheme)
      return nextTheme
    })
  }, [])

  return (
    <main
      className="map-shell"
      ref={mapShellRef}
      style={{ '--desktop-navigation-width': `${navigationColumnWidth}px` } as CSSProperties}
    >
      <div className="map-stage">
        <div
          ref={mapContainer}
          className="map"
          style={{ '--map-overlay-bottom-inset': `${mapInsets.bottom}px` } as CSSProperties}
        />
        <div className="map-control-stack">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          {import.meta.env.DEV && (
            <JourneyTestTimeControl
              simulatedAtMs={simulatedAtMs}
              onApply={(instantMs) => {
                testClock.set(instantMs)
                setSimulatedAtMs(instantMs)
                session?.replanJourney()
              }}
              onReset={() => {
                testClock.set(null)
                setSimulatedAtMs(null)
                session?.replanJourney()
              }}
            />
          )}
          <LocationControl
            visible={!isMobileViewport || !(
              navigation.activeView === 'plan' && navigation.sheets.plan.detent !== 'collapsed'
            )}
            onRootChange={(root) => {
              locationControlRef.current = root
            }}
            topOffset={mapInsets.top || 76}
            searching={state.location.status === 'requesting'}
            onLocate={() => requestLocationWithNearbyExpansion(commands.locateUser)}
          />
          <aside
            className="map-legend"
            aria-label="Map legend"
            style={{ '--bus-stop-selected-color': selectedRouteColor } as CSSProperties}
          >
            <div><span className="legend-marker venue-marker" /> Venues</div>
            <div className="bus-stop-legend-item">
              <span className="bus-stop-legend-marker bus-stop-legend-marker-selected" aria-hidden="true" />
              On selected route
            </div>
            <div className="bus-stop-legend-item">
              <span className="bus-stop-legend-marker bus-stop-legend-marker-other" aria-hidden="true" />
              Other shuttle stop
            </div>
            <div><span className="legend-marker origin-marker" /> Origin</div>
            <div><span className="legend-marker destination-marker" /> Destination</div>
          </aside>
        </div>
      </div>
      <aside
        className="map-overlay-right navigation-column"
        ref={navigationColumnRef}
      >
        <MainNavigation
          activeView={navigation.activeView}
          onSelectView={(view) => {
            if (!isMobileViewport && view === navigation.activeView) return
            const switchingView = view !== navigation.activeView
            const reopeningCollapsedView = !switchingView && activeSheetDetent === 'collapsed'
            if (isMobileViewport && (switchingView || reopeningCollapsedView)) {
              prepareSheetTransition(reopeningCollapsedView)
              if (switchingView && navigation.sheets[navigation.activeView].search) {
                dispatchNavigation({
                  type: 'dismiss-search',
                  view: navigation.activeView,
                })
              }
              if (
                switchingView &&
                navigation.activeView === 'explore' &&
                state.contextualPanel.mode === 'shuttle'
              ) {
                commands.suspendMobileRoutes()
              } else if (
                switchingView &&
                view === 'explore' &&
                state.contextualPanel.mode === 'shuttle'
              ) {
                commands.enterMobileRoutes()
              }
            }
            if (view === 'stops' && stopsView.list === 'nearby' && state.location.status === 'disabled') {
              commands.enableLocationTracking()
            }
            dispatchNavigation({ type: 'select-view', view })
          }}
          containerRef={mainNavigationRef}
        />
        <div className="navigation-view-stack">
        <DesktopColumnShell id="plan-panel" active={navigation.activeView === 'plan'}>
          <MobileSheetShell
            className={`trip-controls${!isMobileViewport || navigation.sheets.plan.detent !== 'collapsed' ? ' trip-controls-expanded' : ' trip-controls-collapsed'}`}
            label="Plan trip panel"
            controlsId="trip-controls-panel-content"
            detent={isMobileViewport ? navigation.sheets.plan.detent : 'partial'}
            lastNonCollapsedDetent={navigation.sheets.plan.lastNonCollapsedDetent}
            enabled={isMobileViewport}
            onBeforeToggle={() => prepareSheetTransition()}
            onDetentChange={(detent) => {
              if (detent !== 'collapsed' && isFocusInsideLocationControl(locationControlRef.current)) {
                focusTripControlAfterOverlayRef.current = true
              }
              dispatchNavigation({ type: 'set-sheet-detent', view: 'plan', detent, source: 'manual' })
            }}
            sectionProps={{ 'aria-label': 'Trip endpoints' }}
            shellRef={tripControlsRef}
          >
            <PlanView
              tripRequest={state.tripRequest}
              venues={state.venues}
              networkIndex={state.transitIndex}
              expanded={!isMobileViewport || navigation.sheets.plan.detent !== 'collapsed'}
              onSwap={commands.swapTripEndpoints}
              onSelectOriginEndpoint={commands.selectOriginEndpoint}
              onClearOriginEndpoint={commands.clearOriginEndpoint}
              onSelectDestinationEndpoint={commands.selectDestinationEndpoint}
              onClearDestinationEndpoint={commands.clearDestinationEndpoint}
              onClearTrip={commands.clearTrip}
              journey={state.journey}
              simulatedAtMs={simulatedAtMs}
              onSearchFocus={() => beginMobileSearch('plan')}
              onSearchCancel={() => dismissMobileSearch('plan')}
              onSearchResult={() => selectMobileSearchResult('plan')}
            />
          </MobileSheetShell>
        </DesktopColumnShell>
        <DesktopColumnShell id="explore-panel" active={navigation.activeView === 'explore'}>
          <MobileSheetShell
            className={getExploreShellClassName(
              state.contextualPanel,
              isMobileViewport && navigation.sheets.explore.detent === 'collapsed',
            )}
            label="Explore panel"
            controlsId="contextual-panel-content"
            detent={isMobileViewport ? navigation.sheets.explore.detent : 'partial'}
            lastNonCollapsedDetent={navigation.sheets.explore.lastNonCollapsedDetent}
            enabled={isMobileViewport}
            onBeforeToggle={() => prepareSheetTransition()}
            onDetentChange={(detent) => dispatchNavigation({
              type: 'set-sheet-detent',
              view: 'explore',
              detent,
              source: 'manual',
            })}
            sectionProps={{
              'aria-labelledby': 'contextual-panel-heading',
              'data-minimized': isMobileViewport && navigation.sheets.explore.detent === 'collapsed',
            }}
            shellRef={contextualPanelRef}
          >
            <ExploreView
              state={state.contextualPanel}
              venues={state.venues}
              transitIndex={state.transitIndex}
              shuttleRoutesAvailable={(state.transitIndex?.routes.length ?? 0) > 0}
              renderShuttleRoutes={(options) => (
                <ShuttleRouteControl
                  network={state.transitIndex?.network ?? null}
                  networkIndex={state.transitIndex}
                  selectedRouteId={state.selectedRouteId}
                  onRouteSelect={(routeId) => commands.selectMobileRoute(routeId)}
                  firstRouteCardRef={options.firstRouteCardRef}
                  onFocusStop={options.onFocusStop}
                />
              )}
              selectedRouteId={state.selectedRouteId}
              minimized={isMobileViewport && navigation.sheets.explore.detent === 'collapsed'}
              mobileSheet={isMobileViewport}
              active={navigation.activeView === 'explore'}
              onRestore={() => dispatchNavigation({
                type: 'set-sheet-detent',
                view: 'explore',
                detent: 'partial',
              })}
              onMinimize={() => dispatchNavigation({
                type: 'set-sheet-detent',
                view: 'explore',
                detent: 'collapsed',
                source: 'manual',
              })}
              status={panelStatus}
              onQueryChange={commands.setContextualPanelQuery}
              onVenueSelect={commands.selectVenue}
              onNavigateToVenue={(venueCode) => {
                commands.selectDestinationEndpoint({ kind: 'venue', id: venueCode })
                if (isMobileViewport) prepareSheetTransition(true)
                pendingViewFocusRef.current = 'plan'
                dispatchNavigation(isMobileViewport
                  ? { type: 'open-plan' }
                  : { type: 'select-view', view: 'plan' })
              }}
              onSearchFocus={() => beginMobileSearch('explore')}
              onSearchCancel={() => dismissMobileSearch('explore')}
              onSearchResult={() => selectMobileSearchResult('explore')}
              onOpenShuttle={() => {
                if (isMobileViewport) {
                  prepareSheetTransition(true)
                  dismissMobileSearch('explore')
                }
                commands.enterMobileRoutes()
              }}
              onLeaveMobileRoutes={() => {
                if (isMobileViewport) {
                  beginMobileSearch('explore')
                }
                commands.leaveMobileRoutes()
              }}
              onFocusStop={commands.focusStop}
              onBack={commands.back}
              onEscape={() => {
                dismissMobileSearch('explore')
                commands.escape()
              }}
              onDismissMapPopup={commands.dismissMapPopup}
            />
          </MobileSheetShell>
        </DesktopColumnShell>
        <DesktopColumnShell id="stops-panel" active={navigation.activeView === 'stops'}>
          <MobileSheetShell
            className="stops-view"
            label="Stops panel"
            controlsId="stops-view-content"
            detent={isMobileViewport ? navigation.sheets.stops.detent : 'partial'}
            lastNonCollapsedDetent={navigation.sheets.stops.lastNonCollapsedDetent}
            enabled={isMobileViewport}
            onBeforeToggle={() => prepareSheetTransition()}
            onDetentChange={(detent) => dispatchNavigation({
              type: 'set-sheet-detent',
              view: 'stops',
              detent,
              source: 'manual',
            })}
            sectionProps={{ 'aria-label': 'Stops' }}
            shellRef={stopsSheetRef}
          >
            <StopsView
              expanded={!isMobileViewport || navigation.sheets.stops.detent !== 'collapsed'}
              selectedStop={stopSelection}
              overviewStops={overviewStops}
              overviewLoading={!transitIndex || (stopsView.list === 'nearby' && !mapCenter)}
              liveArrivalMessage={liveArrivalMessage}
              selectedList={stopsView.list}
              selectedStopFavorite={selectedStop
                ? stopsView.favoriteStopIds.includes(selectedStop.id)
                : false}
              locationNotice={locationNotice}
              onSelectList={(list) => {
                if (list === 'nearby' && state.location.status === 'disabled') commands.enableLocationTracking()
                dispatchStopsView({ type: 'select-list', list })
              }}
              onToggleFavorite={(stopId) => dispatchStopsView({ type: 'toggle-favorite', stopId })}
              onToggleExpanded={(stopId) => dispatchStopsView({ type: 'toggle-expanded', stopId })}
              onDismissLocationNotice={() => dispatchStopsView({ type: 'dismiss-location-notice' })}
              onBackToStops={() => dispatchStopsView({ type: 'back-to-stops' })}
              onSelectOppositeStop={(stopId) => {
                handleStopSelected(stopId)
              }}
              onSelectRoute={(routeId) => {
                if (isMobileViewport) {
                  prepareSheetTransition(true)
                  dispatchNavigation({ type: 'set-sheet-detent', view: 'explore', detent: 'partial' })
                }
                commands.enterMobileRoutes()
                commands.selectMobileRoute(routeId)
                pendingViewFocusRef.current = 'explore'
                dispatchNavigation({ type: 'select-view', view: 'explore' })
              }}
              onNavigateToStop={(stopId) => {
                commands.selectDestinationEndpoint({ kind: 'stop', id: stopId })
                prepareSheetTransition(true)
                pendingViewFocusRef.current = 'plan'
                dispatchNavigation(isMobileViewport
                  ? { type: 'open-plan' }
                  : { type: 'select-view', view: 'plan' })
              }}
            />
          </MobileSheetShell>
        </DesktopColumnShell>
        </div>
      </aside>
    </main>
  )
}

export default App
