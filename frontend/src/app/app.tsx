import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { LocationControl } from '../ui/location-control'
import { isFocusInsideLocationControl } from '../ui/location-control-focus'
import { animateMobileSheet } from '../ui/mobile/mobile-sheet/animate-mobile-sheet'
import { createNavigationSession, type NavigationSession } from './navigation-session'
import {
  createNavigationSessionCommandAdapter,
  createNavigationSessionMount,
} from './navigation-session-mount'
import { useNavigationSession } from './use-navigation-session'
import { deriveExploreViewStatus } from './explore-view-status'
import { getIsMobileViewport, subscribeToMobileViewport } from './navigation/navigation-state'
import type { NavigationView } from '../ui/navigation-view'
import { createMapSession } from '../infrastructure/map/session'
import { applyTheme, getSystemTheme, type Theme } from '../ui/theme'
import { ThemeToggle } from '../ui/theme-toggle'
import { JourneyTestTimeControl } from '../ui/journey-test-time-control'
import { createJourneyTestClockStore } from './journey-test-clock-store'
import { createAppServices } from './composition/app-services'
import { AppViews, type AppViewsProps } from './composition/app-views'
import { useStopsViewModel } from '../features/stops-view/use-stops-view-model'
import { useAppNavigation, useAppNavigationState } from './navigation/use-app-navigation'
import { useMapOverlayLayout } from './map-layout/use-map-overlay-layout'
import type { ShuttleArrivalSnapshot } from '../domain/transit/arrivals'
import type { PublicBusArrivalSnapshot } from '../domain/transit/public-bus-arrivals'
import type { StopsArrivalLoader } from '../features/stops-view/use-stops-arrivals'
import type { StopsServiceWindowsLoader } from '../features/stops-view/use-stops-service-windows'

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const locationControlRef = useRef<HTMLDivElement>(null)
  const mapShellRef = useRef<HTMLElement>(null)
  const [sheetPortalContainer, setSheetPortalContainer] = useState<HTMLElement | null>(null)
  const tripControlsRef = useRef<HTMLElement>(null)
  const exploreViewRef = useRef<HTMLElement>(null)
  const stopsSheetRef = useRef<HTMLElement>(null)
  const mainNavigationRef = useRef<HTMLElement>(null)
  const navigationColumnRef = useRef<HTMLElement>(null)
  const pendingViewFocusRef = useRef<NavigationView | null>(null)
  const [session, setSession] = useState<NavigationSession | null>(null)
  const [theme, setTheme] = useState<Theme>(getSystemTheme)
  const [simulatedAtMs, setSimulatedAtMs] = useState<number | null>(null)
  const [mobileSheetImplementation] = useState<AppViewsProps['mobileSheetImplementation']>(() => (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('sheet') === 'custom'
      ? 'custom'
      : 'base-ui'
  ))
  const [testClock] = useState(createJourneyTestClockStore)
  const [services] = useState(() => createAppServices({ journeyTestClock: testClock }))
  const state = useNavigationSession(session)
  const panelStatus = deriveExploreViewStatus(
    state.resourceStatus,
    state.mapError,
    state.startupFailure,
  )
  const [isMobileViewport, setIsMobileViewport] = useState(getIsMobileViewport)
  const navigationState = useAppNavigationState()
  const [mapCenter, setMapCenter] = useState<{ longitude: number; latitude: number } | null>(null)
  const prepareSheetTransitionRef = useRef<((viewChange?: boolean) => void) | null>(null)
  const focusTripControlAfterOverlayRef = useRef(false)
  const assignMapShellRef = useCallback((shell: HTMLElement | null): void => {
    mapShellRef.current = shell
    setSheetPortalContainer(shell)
  }, [])
  const pendingSheetTransitionRef = useRef<{
    startHeight: number
    startBottom: number
    viewChange: boolean
  } | null>(null)
  const sheetAnimationCleanupRef = useRef<(() => void) | null>(null)
  const commandAdapter = useMemo(() => createNavigationSessionCommandAdapter(), [])
  const commands = commandAdapter(session)
  const loadStopsArrivals = useCallback<StopsArrivalLoader<ShuttleArrivalSnapshot>>(
    (stops, signal) => services.shuttleArrivalClient.getArrivals(stops, signal),
    [services],
  )
  const loadPublicBusArrivals = useCallback<StopsArrivalLoader<PublicBusArrivalSnapshot>>(
    (stops, signal) => services.publicBusArrivalClient.getArrivals(stops, signal),
    [services],
  )
  const loadStopsServiceWindows = useCallback<StopsServiceWindowsLoader>(
    (routeIds, signal) => services.shuttleServiceHoursClient.getServiceWindows(routeIds, signal),
    [services],
  )
  const requestNearbyLocation = useCallback((): void => {
    session?.locateUser()
  }, [session])
  const stopsView = useStopsViewModel({
    transitIndex: state.transitIndex,
    mapCenter,
    location: state.location,
    active: navigationState.state.activeView === 'stops',
    loadArrivals: loadStopsArrivals,
    loadPublicArrivals: loadPublicBusArrivals,
    loadServiceWindows: loadStopsServiceWindows,
    requestLocation: session ? requestNearbyLocation : null,
    locateFromControl: commands.locateUser,
    enableLocationTracking: commands.enableLocationTracking,
  })
  const appNavigation = useAppNavigation({
    ...navigationState,
    commands,
    isMobileViewport,
    exploreView: state.exploreView,
    focusStop: stopsView.focusStop,
    locationStatus: state.location.status,
    focusSheetTransitionRef: prepareSheetTransitionRef,
    pendingViewFocusRef,
  })
  const navigation = appNavigation.state
  const activeView = appNavigation.activeView
  const activeSheetDetent = appNavigation.activeSheetDetent
  const { mapInsets, navigationColumnWidth } = useMapOverlayLayout({
    commands,
    isMobileViewport,
    navigation,
    mapShellRef,
    sheetPortalContainer,
    tripControlsRef,
    exploreViewRef,
    stopsSheetRef,
    mainNavigationRef,
    navigationColumnRef,
    onMeasurementsApplied: appNavigation.focusStopAfterMapLayout,
  })

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
    if (pendingViewFocusRef.current !== activeView) return
    pendingViewFocusRef.current = null
    const root = activeView === 'explore'
      ? exploreViewRef.current
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
    return exploreViewRef.current
  }, [navigation.activeView])

  const prepareSheetTransition = useCallback((viewChange = activeSheetDetent === 'collapsed'): void => {
    if (!isMobileViewport || mobileSheetImplementation === 'base-ui') return
    sheetAnimationCleanupRef.current?.()
    sheetAnimationCleanupRef.current = null
    const sheet = getActiveMobileSheet()
    const startHeight = sheet?.getBoundingClientRect().height ?? 0
    const startBottom = sheet ? Number.parseFloat(window.getComputedStyle(sheet).bottom) : 0
    pendingSheetTransitionRef.current = sheet
      ? { startHeight, startBottom: Number.isFinite(startBottom) ? startBottom : 0, viewChange }
      : null
  }, [activeSheetDetent, getActiveMobileSheet, isMobileViewport, mobileSheetImplementation])

  useLayoutEffect(() => {
    prepareSheetTransitionRef.current = (viewChange) => prepareSheetTransition(viewChange)
  }, [activeSheetDetent, prepareSheetTransition])

  useLayoutEffect(() => {
    const pending = pendingSheetTransitionRef.current
    if (!pending || !isMobileViewport || mobileSheetImplementation === 'base-ui') return
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
    mobileSheetImplementation,
    getActiveMobileSheet,
    navigation.activeView,
    navigation.sheets.explore.detent,
    navigation.sheets.plan.detent,
    navigation.sheets.stops.detent,
    state.exploreView.mode,
  ])

  useLayoutEffect(() => {
    if (!focusTripControlAfterOverlayRef.current) return
    focusTripControlAfterOverlayRef.current = false
    const focusTarget = tripControlsRef.current?.querySelector<HTMLElement>(
      '.plan-view-content input:not([disabled]), .plan-view-content select:not([disabled]), .plan-view-content textarea:not([disabled]), .mobile-sheet-handle',
    )
    focusTarget?.focus()
  }, [isMobileViewport, navigation.sheets.plan.detent])

  useEffect(() => {
    if (!mapContainer.current) return

    const mount = createNavigationSessionMount(mapContainer.current, {
      createMapSession,
      createNavigationSession,
      loadVenues: services.loadVenues,
      loadTransit: services.loadTransit,
      journeyPlanner: services.journeyPlanner,
      locationTracker: services.createLocationTracker(),
      onStopSelected: appNavigation.handleStopSelected,
      onMapStopInteraction: appNavigation.handleMapStopInteraction,
      onMapCenterChange: ([longitude, latitude]) => setMapCenter({ longitude, latitude }),
    })
    setSession(mount.session)

    return () => {
      mount.dispose()
    }
  }, [appNavigation.handleMapStopInteraction, appNavigation.handleStopSelected, services])

  const selectedRouteColor = state.selectedRouteColor ?? 'var(--bus-stop-default-color)'
  const toggleTheme = useCallback((): void => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark'
      applyTheme(nextTheme)
      return nextTheme
    })
  }, [])

  const planViewProps: AppViewsProps['views']['plan'] = {
    tripRequest: state.tripRequest,
    venues: state.venues,
    networkIndex: state.transitIndex,
    onSwap: commands.swapTripEndpoints,
    onSelectOriginEndpoint: commands.selectOriginEndpoint,
    onClearOriginEndpoint: commands.clearOriginEndpoint,
    onSelectDestinationEndpoint: commands.selectDestinationEndpoint,
    onClearDestinationEndpoint: commands.clearDestinationEndpoint,
    onClearTrip: commands.clearTrip,
    onPlanJourney: commands.planJourney,
    originLocationRequest: state.originLocationRequest,
    onUseCurrentLocationForOrigin: commands.useCurrentLocationForOrigin,
    onCancelOriginLocationRequest: commands.cancelOriginLocationRequest,
    journey: state.journey,
    simulatedAtMs,
    onSearchFocus: () => appNavigation.beginMobileSearch('plan'),
    onSearchCancel: () => appNavigation.dismissMobileSearch('plan'),
    onSearchResult: () => appNavigation.selectMobileSearchResult('plan'),
  }
  const exploreViewProps: AppViewsProps['views']['explore'] = {
    state: state.exploreView,
    venues: state.venues,
    transitIndex: state.transitIndex,
    shuttleRoutesAvailable: (state.transitIndex?.routes.length ?? 0) > 0,
    selectedRouteId: state.selectedRouteId,
    status: panelStatus,
    onQueryChange: commands.setExploreViewQuery,
    onVenueSelect: commands.selectVenue,
    onNavigateToVenue: appNavigation.navigateToVenue,
    onRestore: () => appNavigation.dispatch({
      type: 'set-sheet-detent',
      view: 'explore',
      detent: 'partial',
    }),
    onMinimize: () => appNavigation.dispatch({
      type: 'set-sheet-detent',
      view: 'explore',
      detent: 'collapsed',
      source: 'manual',
    }),
    onSearchFocus: () => appNavigation.beginMobileSearch('explore'),
    onSearchCancel: () => appNavigation.dismissMobileSearch('explore'),
    onSearchResult: () => appNavigation.selectMobileSearchResult('explore'),
    onOpenShuttle: () => {
      if (isMobileViewport) {
        prepareSheetTransition(true)
        appNavigation.dismissMobileSearch('explore')
      }
      commands.enterMobileRoutes()
    },
    onLeaveMobileRoutes: () => {
      if (isMobileViewport) appNavigation.beginMobileSearch('explore')
      commands.leaveMobileRoutes()
    },
    onFocusStop: commands.focusStop,
    onBack: commands.back,
    onEscape: appNavigation.escapeExplore,
    onDismissMapPopup: commands.dismissMapPopup,
  }
  const stopsViewProps: AppViewsProps['views']['stops'] = {
    selectedStop: stopsView.selectedStop,
    overviewStops: stopsView.overviewStops,
    overviewLoading: stopsView.overviewLoading,
    liveArrivalMessage: stopsView.liveArrivalMessage,
    selectedList: stopsView.state.list,
    selectedStopFavorite: stopsView.selectedStopFavorite,
    locationNotice: stopsView.locationNotice,
    onBackToStops: stopsView.backToStops,
    onSelectOppositeStop: appNavigation.handleStopSelected,
    onSelectRoute: appNavigation.selectRouteFromStops,
    onNavigateToStop: appNavigation.navigateToStop,
    onSelectList: stopsView.selectList,
    onToggleFavorite: stopsView.toggleFavorite,
    onToggleExpanded: stopsView.toggleExpanded,
    onDismissLocationNotice: stopsView.dismissLocationNotice,
  }
  const selectView = (view: AppViewsProps['navigation']['activeView']): void => {
    appNavigation.selectView(view, stopsView.state.list)
  }

  return (
    <main
      className="map-shell"
      ref={assignMapShellRef}
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
            onLocate={stopsView.locateFromControl}
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
      <AppViews
        isMobileViewport={isMobileViewport}
        mobileSheetImplementation={mobileSheetImplementation}
        sheetPortalContainer={sheetPortalContainer}
        navigation={navigation}
        onSelectView={selectView}
        shells={{
          navigationColumnRef,
          mainNavigationRef,
          plan: {
            ref: tripControlsRef,
            onBeforeToggle: () => prepareSheetTransition(),
            onDetentChange: (detent) => {
              if (detent !== 'collapsed' && isFocusInsideLocationControl(locationControlRef.current)) {
                focusTripControlAfterOverlayRef.current = true
              }
              appNavigation.dispatch({
                type: 'set-sheet-detent',
                view: 'plan',
                detent,
                source: 'manual',
              })
            },
          },
          explore: {
            ref: exploreViewRef,
            onBeforeToggle: () => prepareSheetTransition(),
            onDetentChange: (detent) => appNavigation.dispatch({
              type: 'set-sheet-detent',
              view: 'explore',
              detent,
              source: 'manual',
            }),
          },
          stops: {
            ref: stopsSheetRef,
            onBeforeToggle: () => prepareSheetTransition(),
            onDetentChange: (detent) => appNavigation.dispatch({
              type: 'set-sheet-detent',
              view: 'stops',
              detent,
              source: 'manual',
            }),
          },
        }}
        views={{
          plan: planViewProps,
          explore: exploreViewProps,
          exploreRoutes: {
            onRouteSelect: commands.selectMobileRoute,
          },
          stops: stopsViewProps,
        }}
      />
    </main>
  )
}

export default App
