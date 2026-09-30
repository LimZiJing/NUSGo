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
import { ContextualPanel } from '../features/contextual-panel/contextual-panel'
import {
  MobileStopsSheet,
  type MobileStopSheetSelection,
} from '../features/shuttle-browsing/mobile-stops-sheet'
import { getMobileStopSheetSelection } from '../features/shuttle-browsing/mobile-stop-view'
import { getMobileStopsOverview } from '../features/shuttle-browsing/mobile-stops-overview'
import { useMobileStopView } from '../features/shuttle-browsing/use-mobile-stop-view'
import { useMobileStopArrivals } from '../features/shuttle-browsing/use-mobile-stop-arrivals'
import { LocationControl } from '../ui/location-control'
import { isFocusInsideLocationControl } from '../ui/location-control-focus'
import { MobileTabBar } from '../ui/mobile-tab-bar'
import { animateMobileSheet } from '../ui/animate-mobile-sheet'
import { getMobileSheetHeights, getMobileTabBarInset } from '../ui/mobile-sheet-layout'
import { TripEndpointControls } from '../features/trip-endpoints/trip-endpoint-controls'
import { ShuttleRouteControl } from '../features/shuttle-browsing/shuttle-route-control'
import { createNavigationSession, type NavigationSession } from './navigation-session'
import {
  createNavigationSessionCommandAdapter,
  createNavigationSessionMount,
} from './navigation-session-mount'
import { useNavigationSession } from './use-navigation-session'
import { deriveContextualPanelStatus } from './contextual-panel-status'
import {
  createInitialMobileNavigationState,
  getIsMobileViewport,
  mobileNavigationReducer,
  subscribeToMobileViewport,
} from './mobile-navigation-state'
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
import { useMobileStopServiceWindows } from '../features/shuttle-browsing/use-mobile-stop-service-windows'
import { applyTheme, getSystemTheme, type Theme } from '../ui/theme'
import { ThemeToggle } from '../ui/theme-toggle'

function App() {
  const mapShellRef = useRef<HTMLElement>(null)
  const mapContainer = useRef<HTMLDivElement>(null)
  const locationControlRef = useRef<HTMLDivElement>(null)
  const tripControlsRef = useRef<HTMLElement>(null)
  const contextualPanelRef = useRef<HTMLElement>(null)
  const stopsSheetRef = useRef<HTMLElement>(null)
  const mobileTabBarRef = useRef<HTMLElement>(null)
  const [session, setSession] = useState<NavigationSession | null>(null)
  const [theme, setTheme] = useState<Theme>(getSystemTheme)
  const state = useNavigationSession(session)
  const panelStatus = deriveContextualPanelStatus(
    state.resourceStatus,
    state.mapError,
    state.startupFailure,
  )
  const [mobileNavigation, dispatchMobileNavigation] = useReducer(
    mobileNavigationReducer,
    undefined,
    createInitialMobileNavigationState,
  )
  const [isMobileViewport, setIsMobileViewport] = useState(getIsMobileViewport)
  const mobileNavigationRef = useRef(mobileNavigation)
  const isMobileViewportRef = useRef(isMobileViewport)
  const prepareSheetTransitionRef = useRef<(() => void) | null>(null)
  const [mobileStopView, dispatchMobileStopView] = useMobileStopView(state.transitIndex)
  const [mapCenter, setMapCenter] = useState<{ longitude: number; latitude: number } | null>(null)
  const [stopFocusRequest, setStopFocusRequest] = useState<{
    readonly stopId: string | null
    readonly sequence: number
  }>({ stopId: null, sequence: 0 })
  const handledStopFocusRequestRef = useRef(0)
  const initialNearbyLocationRequestedRef = useRef(false)
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
  const loadMobileStopArrivals = useCallback(
    (stops: readonly { readonly stopId: string; readonly stopName: string }[], signal: AbortSignal) => (
      shuttleArrivalClient.getArrivals(stops, signal)
    ),
    [shuttleArrivalClient],
  )
  const shuttleServiceHoursClient = useMemo(() => createShuttleServiceHoursClient(), [])
  const loadMobileStopServiceWindows = useCallback(
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
  ), [routeEngine, shuttleArrivalClient, shuttleServiceHoursClient, walkingConnectionProvider])

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
      const tabBarRect = mobileTabBarRef.current?.getBoundingClientRect()
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

  const activeTab = mobileNavigation.activeTab
  const activeSheetDetent = mobileNavigation.sheets[activeTab].detent
  const activeSheetExpanded = activeSheetDetent !== 'collapsed'
  const dismissMapPopup = commands.dismissMapPopup

  useEffect(() => {
    if (
      !session || !isMobileViewport || activeTab !== 'stops' ||
      mobileStopView.list !== 'nearby' || state.location.status !== 'disabled' ||
      initialNearbyLocationRequestedRef.current
    ) return
    initialNearbyLocationRequestedRef.current = true
    session.locateUser()
  }, [activeTab, isMobileViewport, mobileStopView.list, session, state.location.status])

  const getActiveMobileSheet = useCallback((): HTMLElement | null => {
    if (mobileNavigation.activeTab === 'plan') return tripControlsRef.current
    if (mobileNavigation.activeTab === 'stops') return stopsSheetRef.current
    return contextualPanelRef.current
  }, [mobileNavigation.activeTab])

  useLayoutEffect(() => {
    mobileNavigationRef.current = mobileNavigation
    isMobileViewportRef.current = isMobileViewport
  }, [isMobileViewport, mobileNavigation])

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

  const handleStopSelected = useCallback((stopId: string): boolean => {
    const currentNavigation = mobileNavigationRef.current
    if (
      !isMobileViewportRef.current ||
      currentNavigation.activeTab !== 'stops'
    ) return false

    dispatchMobileStopView({ type: 'focus-stop', stopId })
    setStopFocusRequest((current) => ({ stopId, sequence: current.sequence + 1 }))
    if (currentNavigation.sheets.stops.detent === 'collapsed') {
      prepareSheetTransitionRef.current?.()
      dispatchMobileNavigation({ type: 'set-sheet-detent', tab: 'stops', detent: 'partial' })
    }
    return true
  }, [dispatchMobileStopView])

  useEffect(() => {
    if (!isMobileViewport || activeTab === 'explore') return

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (dismissMapPopup()) {
        event.preventDefault()
        return
      }
      if (!activeSheetExpanded) return
      event.preventDefault()
      dispatchMobileNavigation({ type: 'close-active-tab' })
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [
    activeSheetExpanded,
    activeTab,
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
      mobileNavigation.activeTab === 'explore' &&
      mobileNavigation.sheets.explore.detent === 'collapsed'
    ) {
      dispatchMobileNavigation({ type: 'set-sheet-detent', tab: 'explore', detent: 'partial' })
    }
  }, [
    isMobileViewport,
    mobileNavigation.activeTab,
    mobileNavigation.sheets.explore.detent,
    state.contextualPanel,
  ])

  useLayoutEffect(() => {
    commands.setStopsPinVisible(isMobileViewport && activeTab === 'stops')
  }, [activeTab, commands, isMobileViewport])

  useLayoutEffect(() => {
    const updateInsets = (): void => {
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const activeSheetHeight = mobileNavigation.activeTab === 'plan'
        ? tripControlsRef.current?.getBoundingClientRect().height ?? 0
        : mobileNavigation.activeTab === 'stops'
          ? stopsSheetRef.current?.getBoundingClientRect().height ?? 0
          : contextualPanelRef.current?.getBoundingClientRect().height ?? 0
      const tabBarRect = mobileTabBarRef.current?.getBoundingClientRect()
      const mapShellBottom = mapShellRef.current?.getBoundingClientRect().bottom ?? viewportHeight
      const mapShell = mapShellRef.current
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
          isMobileViewport &&
          mobileNavigation.activeTab === 'stops' &&
          mobileNavigation.sheets.stops.detent !== 'collapsed'
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
    if (mobileTabBarRef.current) resizeObserver?.observe(mobileTabBarRef.current)

    return () => {
      window.removeEventListener('resize', updateInsets)
      window.visualViewport?.removeEventListener('resize', updateInsets)
      window.visualViewport?.removeEventListener('scroll', updateInsets)
      resizeObserver?.disconnect()
    }
  }, [
    commands,
    isMobileViewport,
    mobileNavigation.activeTab,
    mobileNavigation.sheets.explore.detent,
    mobileNavigation.sheets.plan.detent,
    mobileNavigation.sheets.stops.detent,
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
    mobileNavigation.activeTab,
    mobileNavigation.sheets.explore.detent,
    mobileNavigation.sheets.plan.detent,
    mobileNavigation.sheets.stops.detent,
    state.contextualPanel.mode,
  ])

  useLayoutEffect(() => {
    if (!focusTripControlAfterOverlayRef.current) return
    focusTripControlAfterOverlayRef.current = false
    const focusTarget = tripControlsRef.current?.querySelector<HTMLElement>(
      '.trip-controls-body input:not([disabled]), .trip-controls-body select:not([disabled]), .trip-controls-body textarea:not([disabled]), .mobile-sheet-handle',
    )
    focusTarget?.focus()
  }, [isMobileViewport, mobileNavigation.sheets.plan.detent])

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
      onMapCenterChange: ([longitude, latitude]) => setMapCenter({ longitude, latitude }),
    })
    setSession(mount.session)

    return () => {
      mount.dispose()
    }
  }, [handleStopSelected, journeyPlanner])

  useEffect(() => {
    if (!isMobileViewport || activeTab !== 'stops') return
    dismissMapPopup()
  }, [activeTab, dismissMapPopup, isMobileViewport])

  const selectedRouteColor = state.selectedRouteColor ?? 'var(--bus-stop-default-color)'
  const transitIndex = state.transitIndex
  const selectedStop = mobileStopView.focusedStopId === null
    ? undefined
    : transitIndex?.stopById.get(mobileStopView.focusedStopId)
  const hasLocationError = ['denied', 'unavailable', 'timeout', 'invalid'].includes(state.location.status)
  const locationFix = hasLocationError ? null : state.location.latestFix
  const overviewStopEntries = useMemo(() => transitIndex ? getMobileStopsOverview(
    transitIndex,
    mobileStopView.list,
    mapCenter,
    locationFix,
    mobileStopView.favoriteStopIds,
  ) : [], [
    locationFix,
    mapCenter,
    mobileStopView.favoriteStopIds,
    mobileStopView.list,
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
  const stopArrivals = useMobileStopArrivals(
    loadMobileStopArrivals,
    isMobileViewport && activeTab === 'stops',
    arrivalStopRequests,
  )
  const serviceRouteIds = useMemo(() => {
    const routeIds = new Set<string>()
    for (const { stopId } of arrivalStopRequests) {
      for (const routeId of transitIndex?.routeIdsByStopId.get(stopId) ?? []) routeIds.add(routeId)
    }
    return [...routeIds].sort()
  }, [arrivalStopRequests, transitIndex])
  const stopServiceWindows = useMobileStopServiceWindows(
    loadMobileStopServiceWindows,
    isMobileViewport && activeTab === 'stops',
    serviceRouteIds,
  )
  const stopArrivalsUpdating = stopArrivals.status === 'refreshing' || stopArrivals.status === 'error'
  const mobileStopSelection: MobileStopSheetSelection | null = selectedStop && transitIndex
    ? getMobileStopSheetSelection(
      selectedStop,
      transitIndex,
      mobileStopView.favoriteStopIds,
      stopArrivals.snapshot,
      stopArrivals.nowMs,
      stopServiceWindows.windows,
      stopArrivalsUpdating,
    )
    : null
  const overviewStops = transitIndex ? overviewStopEntries.map(({ stop, distanceMeters }) => ({
    stop: getMobileStopSheetSelection(
      stop,
      transitIndex,
      mobileStopView.favoriteStopIds,
      stopArrivals.snapshot,
      stopArrivals.nowMs,
      stopServiceWindows.windows,
      stopArrivalsUpdating,
    ),
    distanceMeters,
    favorite: mobileStopView.favoriteStopIds.includes(stop.id),
    expanded: !mobileStopView.collapsedStopIds.includes(stop.id),
  })) : []
  const locationNotice = hasLocationError && !mobileStopView.locationNoticeDismissed
    ? 'Location is unavailable. Showing stops near the map centre without distances.'
    : null
  const liveArrivalMessage = stopArrivals.snapshot
    ? null
    : stopArrivals.status === 'loading'
      ? 'Updating…'
      : stopArrivals.status === 'error'
        ? 'No live data'
        : null

  const beginMobileSearch = (tab: 'explore' | 'plan'): void => {
    if (!isMobileViewport) return
    prepareSheetTransition(true)
    dispatchMobileNavigation({ type: 'start-search', tab })
  }
  const dismissMobileSearch = (tab: 'explore' | 'plan'): void => {
    dispatchMobileNavigation({ type: 'dismiss-search', tab })
  }
  const selectMobileSearchResult = (tab: 'explore' | 'plan'): void => {
    if (isMobileViewport) prepareSheetTransition(true)
    dispatchMobileNavigation({ type: 'select-search-result', tab })
  }
  const toggleTheme = useCallback((): void => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark'
      applyTheme(nextTheme)
      return nextTheme
    })
  }, [])

  return (
    <main className="map-shell" ref={mapShellRef}>
      <div className="map-stage">
        <div
          ref={mapContainer}
          className="map"
          style={{ '--map-overlay-bottom-inset': `${mapInsets.bottom}px` } as CSSProperties}
        />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <LocationControl
          visible={!isMobileViewport || !(
            mobileNavigation.activeTab === 'plan' && mobileNavigation.sheets.plan.detent !== 'collapsed'
          )}
          onRootChange={(root) => {
            locationControlRef.current = root
          }}
          topOffset={mapInsets.top || 76}
          searching={state.location.status === 'requesting'}
          onLocate={commands.locateUser}
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
      <div className="map-overlay-right">
        <div
          id="mobile-plan-panel"
          hidden={isMobileViewport && mobileNavigation.activeTab !== 'plan'}
        >
          <TripEndpointControls
            tripRequest={state.tripRequest}
            venues={state.venues}
            networkIndex={state.transitIndex}
            onSwap={commands.swapTripEndpoints}
            onSelectOriginEndpoint={commands.selectOriginEndpoint}
            onClearOriginEndpoint={commands.clearOriginEndpoint}
            onSelectDestinationEndpoint={commands.selectDestinationEndpoint}
            onClearDestinationEndpoint={commands.clearDestinationEndpoint}
            onClearTrip={commands.clearTrip}
            journey={state.journey}
            containerRef={tripControlsRef}
            detent={isMobileViewport ? mobileNavigation.sheets.plan.detent : undefined}
            lastNonCollapsedDetent={mobileNavigation.sheets.plan.lastNonCollapsedDetent}
            mobileViewport={isMobileViewport}
            onDetentChange={(detent) => {
              if (!isMobileViewport) return
              if (detent !== 'collapsed' && isFocusInsideLocationControl(locationControlRef.current)) {
                focusTripControlAfterOverlayRef.current = true
              }
              dispatchMobileNavigation({ type: 'set-sheet-detent', tab: 'plan', detent, source: 'manual' })
            }}
            onBeforeSheetToggle={() => prepareSheetTransition()}
            onSearchFocus={() => beginMobileSearch('plan')}
            onSearchCancel={() => dismissMobileSearch('plan')}
            onSearchResult={() => selectMobileSearchResult('plan')}
          />
        </div>
        <div
          id="mobile-explore-panel"
          hidden={isMobileViewport && mobileNavigation.activeTab !== 'explore'}
        >
          <ContextualPanel
            state={state.contextualPanel}
            venues={state.venues}
            transitIndex={state.transitIndex}
            shuttleRoutesAvailable={(state.transitIndex?.routes.length ?? 0) > 0}
            renderShuttleRoutes={(selectRef, options) => (
              <ShuttleRouteControl
                network={state.transitIndex?.network ?? null}
                networkIndex={state.transitIndex}
                selectedRouteId={state.selectedRouteId}
                onRouteSelect={isMobileViewport
                  ? (routeId) => { if (routeId) commands.selectMobileRoute(routeId) }
                  : commands.selectRoute}
                selectRef={selectRef}
                mobileViewport={isMobileViewport}
                firstRouteCardRef={options.firstRouteCardRef}
                onFocusStop={options.onFocusStop}
              />
            )}
            selectedRouteId={state.selectedRouteId}
            minimized={isMobileViewport && mobileNavigation.sheets.explore.detent === 'collapsed'}
            sheetDetent={isMobileViewport ? mobileNavigation.sheets.explore.detent : undefined}
            lastNonCollapsedDetent={mobileNavigation.sheets.explore.lastNonCollapsedDetent}
            mobileViewport={isMobileViewport}
            active={!isMobileViewport || mobileNavigation.activeTab === 'explore'}
            onRestore={() => dispatchMobileNavigation({
              type: 'set-sheet-detent',
              tab: 'explore',
              detent: 'partial',
            })}
            onMinimize={() => dispatchMobileNavigation({
              type: 'set-sheet-detent',
              tab: 'explore',
              detent: 'collapsed',
              source: 'manual',
            })}
            onDetentChange={(detent) => dispatchMobileNavigation({
              type: 'set-sheet-detent',
              tab: 'explore',
              detent,
              source: 'manual',
            })}
            onBeforeSheetToggle={() => prepareSheetTransition()}
            containerRef={contextualPanelRef}
            status={panelStatus}
            onQueryChange={commands.setContextualPanelQuery}
            onVenueSelect={commands.selectVenue}
            onNavigateToVenue={(venueCode) => {
              commands.selectDestinationEndpoint({ kind: 'venue', id: venueCode })
              if (isMobileViewport) {
                prepareSheetTransition(true)
                dispatchMobileNavigation({ type: 'open-plan' })
              }
            }}
            onOpenVenueSearch={() => {
              if (isMobileViewport) {
                beginMobileSearch('explore')
              }
              commands.openVenueSearch()
            }}
            onSearchFocus={() => beginMobileSearch('explore')}
            onSearchCancel={() => dismissMobileSearch('explore')}
            onSearchResult={() => selectMobileSearchResult('explore')}
            onOpenShuttle={() => {
              if (isMobileViewport) {
                prepareSheetTransition(true)
                dismissMobileSearch('explore')
                commands.enterMobileRoutes()
              } else commands.openShuttle()
            }}
            onLeaveMobileRoutes={() => {
              if (isMobileViewport) {
                beginMobileSearch('explore')
              }
              commands.leaveMobileRoutes()
            }}
            onFocusStop={commands.focusStop}
            onBack={commands.back}
            onClose={() => {
              dismissMobileSearch('explore')
              if (isMobileViewport) commands.closeToRoot()
              else commands.close()
            }}
            onEscape={() => {
              dismissMobileSearch('explore')
              commands.escape()
            }}
            onDismissMapPopup={isMobileViewport ? commands.dismissMapPopup : undefined}
          />
        </div>
        <div
          id="mobile-stops-panel"
          hidden={!isMobileViewport || mobileNavigation.activeTab !== 'stops'}
        >
          <MobileStopsSheet
            detent={mobileNavigation.sheets.stops.detent}
            lastNonCollapsedDetent={mobileNavigation.sheets.stops.lastNonCollapsedDetent}
            selectedStop={mobileStopSelection}
            overviewStops={overviewStops}
            overviewLoading={!transitIndex || (mobileStopView.list === 'nearby' && !mapCenter)}
            liveArrivalMessage={liveArrivalMessage}
            selectedList={mobileStopView.list}
            selectedStopFavorite={selectedStop
              ? mobileStopView.favoriteStopIds.includes(selectedStop.id)
              : false}
            locationNotice={locationNotice}
            onSelectList={(list) => {
              if (list === 'nearby' && state.location.status === 'disabled') commands.enableLocationTracking()
              dispatchMobileStopView({ type: 'select-list', list })
            }}
            onToggleFavorite={(stopId) => dispatchMobileStopView({ type: 'toggle-favorite', stopId })}
            onToggleExpanded={(stopId) => dispatchMobileStopView({ type: 'toggle-expanded', stopId })}
            onDismissLocationNotice={() => dispatchMobileStopView({ type: 'dismiss-location-notice' })}
            onDetentChange={(detent) => dispatchMobileNavigation({
              type: 'set-sheet-detent',
              tab: 'stops',
              detent,
              source: 'manual',
            })}
            onBackToStops={() => dispatchMobileStopView({ type: 'back-to-stops' })}
            onSelectOppositeStop={(stopId) => {
              handleStopSelected(stopId)
            }}
            onSelectRoute={(routeId) => {
              prepareSheetTransition(true)
              commands.enterMobileRoutes()
              commands.selectMobileRoute(routeId)
              dispatchMobileNavigation({ type: 'set-sheet-detent', tab: 'explore', detent: 'partial' })
              dispatchMobileNavigation({ type: 'select-tab', tab: 'explore' })
            }}
            onNavigateToStop={(stopId) => {
              commands.selectDestinationEndpoint({ kind: 'stop', id: stopId })
              prepareSheetTransition(true)
              dispatchMobileNavigation({ type: 'open-plan' })
            }}
            onBeforeSheetToggle={() => prepareSheetTransition()}
            containerRef={stopsSheetRef}
          />
        </div>
      </div>
      <MobileTabBar
        activeTab={mobileNavigation.activeTab}
        onSelectTab={(tab) => {
          if (tab === 'stops' && mobileStopView.list === 'nearby' && state.location.status === 'disabled') {
            commands.enableLocationTracking()
          }
          const switchingTab = tab !== mobileNavigation.activeTab
          const reopeningCollapsedTab = !switchingTab && activeSheetDetent === 'collapsed'
          if (isMobileViewport && (switchingTab || reopeningCollapsedTab)) {
            prepareSheetTransition(reopeningCollapsedTab)
            if (switchingTab && mobileNavigation.sheets[mobileNavigation.activeTab].search) {
              dispatchMobileNavigation({ type: 'dismiss-search', tab: mobileNavigation.activeTab })
            }
            if (switchingTab && mobileNavigation.activeTab === 'explore' && state.contextualPanel.mode === 'shuttle') {
              commands.suspendMobileRoutes()
            } else if (switchingTab && tab === 'explore' && state.contextualPanel.mode === 'shuttle') {
              commands.enterMobileRoutes()
            }
          }
          dispatchMobileNavigation({ type: 'select-tab', tab })
        }}
        containerRef={mobileTabBarRef}
      />
    </main>
  )
}

export default App
