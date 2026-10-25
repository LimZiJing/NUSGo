import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { LocationControl } from '../ui/location-control'
import { NearbyCrosshair } from '../ui/nearby-crosshair'
import { isFocusInsideLocationControl } from '../ui/location-control-focus'
import { createNavigationSession, type NavigationSession } from './navigation-session'
import {
  createNavigationSessionCommandAdapter,
  createNavigationSessionMount,
} from './navigation-session-mount'
import { useNavigationSession } from './use-navigation-session'
import { deriveExplorePanelStatus } from './explore-panel-status'
import { getIsMobileViewport, subscribeToMobileViewport } from './navigation/navigation-state'
import type { NavigationView } from '../ui/navigation-view'
import { createMapSession } from '../infrastructure/map/session'
import { MoreEntryButton } from '../ui/more-entry-button'
import {
  applyTheme,
  getSystemTheme,
  readThemePreference,
  saveThemePreference,
  subscribeToSystemThemeChanges,
  type ThemePreference,
} from '../ui/theme'
import { MobileSheetMetricsContext } from '../ui/mobile/mobile-sheet/mobile-sheet-metrics'
// Dev-only: import.meta.env.DEV is a build-time constant, so production builds drop this
// dynamic import, the control module and its CSS.
const JourneyTestTimeControl = import.meta.env.DEV
  ? lazy(() => import('../ui/journey-test-time-control').then((module) => ({ default: module.JourneyTestTimeControl })))
  : null
import { createJourneyTestClockStore } from './journey-test-clock-store'
import { createAppServices } from './composition/app-services'
import { AppViews, type AppViewsProps } from './composition/app-views'
import { useExplorePanelFocus } from '../features/explore/hooks/use-explore-panel-focus'
import { usePlanTripForm } from '../features/plan/hooks/use-plan-trip-form'
import { useStopsWorkflow } from '../features/stops/hooks/use-stops-workflow'
import { SettingsContent } from '../features/settings/settings-content'
import { MoreMenu } from '../features/more/more-menu'
import {
  PersonalWaypointForm,
  PersonalWaypointPlacement,
  PersonalWaypointsHome,
  usePersonalWaypointWorkflow,
} from '../features/waypoints/personal'
import { createLocalPersonalWaypointStore } from '../infrastructure/data/local-personal-waypoint-store'
import { useAppNavigation, useAppNavigationState } from './navigation/use-app-navigation'
import { useMapOverlayLayout } from './map-layout/use-map-overlay-layout'
import { useMobilePlanRefit } from './map-layout/use-mobile-plan-refit'
import { useStopsEntryRefit } from './map-layout/use-stops-entry-refit'
import { useExploreEntryRefit } from './map-layout/use-explore-entry-refit'
import type { ShuttleArrivalSnapshot } from '../domain/transit/arrivals'
import type { PublicBusArrivalSnapshot } from '../domain/transit/public-bus-arrivals'
import type { StopsArrivalLoader } from '../features/stops/hooks/use-stops-arrivals'
import type { StopsServiceWindowsLoader } from '../features/stops/hooks/use-stops-service-windows'

function App() {
  type MorePage = 'closed' | 'menu' | 'waypoints' | 'placing' | 'creating' | 'settings'
  const mapContainer = useRef<HTMLDivElement>(null)
  const locationControlRef = useRef<HTMLDivElement>(null)
  const mapShellRef = useRef<HTMLElement>(null)
  const [sheetPortalContainer, setSheetPortalContainer] = useState<HTMLElement | null>(null)
  const tripControlsRef = useRef<HTMLElement>(null)
  const explorePanelRef = useRef<HTMLElement>(null)
  const stopsSheetRef = useRef<HTMLElement>(null)
  const mainNavigationRef = useRef<HTMLElement>(null)
  const moreEntryButtonRef = useRef<HTMLButtonElement>(null)
  const moreInitialFocusRef = useRef<HTMLButtonElement>(null)
  const personalWaypointsInitialFocusRef = useRef<HTMLButtonElement>(null)
  const personalWaypointNameRef = useRef<HTMLInputElement>(null)
  const moreWasOpenRef = useRef(false)
  const skipMoreFocusRestoreRef = useRef(false)
  const navigationColumnRef = useRef<HTMLElement>(null)
  const pendingViewFocusRef = useRef<NavigationView | null>(null)
  const pendingExploreReturnFocusRef = useRef<HTMLElement | null>(null)
  const [session, setSession] = useState<NavigationSession | null>(null)
  const [morePage, setMorePage] = useState<MorePage>('closed')
  const [placementReturnsToForm, setPlacementReturnsToForm] = useState(false)
  const [personalWaypointStore] = useState(createLocalPersonalWaypointStore)
  const personalWaypoints = usePersonalWaypointWorkflow(personalWaypointStore)
  const updatePersonalWaypointDraft = personalWaypoints.updateDraft
  // Coordinate placement needs the full map stage, so keep the More panel inactive while it is open.
  const isMoreOpen = morePage !== 'closed' && morePage !== 'placing'
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference)
  const [simulatedAtMs, setSimulatedAtMs] = useState<number | null>(null)
  const [testClock] = useState(createJourneyTestClockStore)
  const [services] = useState(() => createAppServices({ journeyTestClock: testClock }))

  useEffect(() => {
    const applyPreference = (): void => {
      applyTheme(themePreference === 'system' ? getSystemTheme() : themePreference)
    }
    applyPreference()
    return themePreference === 'system'
      ? subscribeToSystemThemeChanges(applyPreference)
      : undefined
  }, [themePreference])

  const state = useNavigationSession(session)
  const explorePanelStatus = deriveExplorePanelStatus(
    state.resourceStatus,
    state.mapError,
    state.startupFailure,
  )
  const [isMobileViewport, setIsMobileViewport] = useState(getIsMobileViewport)
  const navigationState = useAppNavigationState()
  const [mapJourneySelectionRevision, setMapJourneySelectionRevision] = useState(0)
  const pendingMapJourneySelectionRef = useRef<string | null>(null)
  const [mapCenter, setMapCenter] = useState<{ longitude: number; latitude: number } | null>(null)
  const focusTripControlAfterOverlayRef = useRef(false)
  const assignMapShellRef = useCallback((shell: HTMLElement | null): void => {
    mapShellRef.current = shell
    setSheetPortalContainer(shell)
  }, [])
  const changeThemePreference = useCallback((preference: ThemePreference): void => {
    saveThemePreference(preference)
    setThemePreference(preference)
  }, [])
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
  const stopsWorkflow = useStopsWorkflow({
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
  useLayoutEffect(() => {
    commands.setNearbyStopHighlight(stopsWorkflow.nearbyHighlightStopIds)
  }, [commands, stopsWorkflow.nearbyHighlightStopIds])
  const isCrosshairVisible = !isMoreOpen && morePage !== 'placing' && stopsWorkflow.showNearbyCrosshair
  useLayoutEffect(() => {
    commands.setVisibleCenterZoom(isCrosshairVisible)
  }, [commands, isCrosshairVisible])
  const handlePersonalWaypointMapChange = useCallback((coordinate: readonly [number, number]): void => {
    updatePersonalWaypointDraft({
      coordinate: { longitude: coordinate[0], latitude: coordinate[1] },
    })
  }, [updatePersonalWaypointDraft])
  // App composition passes map placement events into the waypoint feature's draft workflow.
  useEffect(() => {
    const visible = morePage === 'placing' || morePage === 'creating'
    const coordinate = visible
      ? [personalWaypoints.draft.coordinate.longitude, personalWaypoints.draft.coordinate.latitude] as const
      : null
    commands.setPersonalWaypointPlacement(
      coordinate,
      morePage === 'placing',
      handlePersonalWaypointMapChange,
    )
  }, [
    commands,
    handlePersonalWaypointMapChange,
    morePage,
    personalWaypoints.draft.coordinate.latitude,
    personalWaypoints.draft.coordinate.longitude,
  ])
  useEffect(() => () => {
    commands.setPersonalWaypointPlacement(null, false, handlePersonalWaypointMapChange)
  }, [commands, handlePersonalWaypointMapChange])
  const appNavigation = useAppNavigation({
    ...navigationState,
    commands,
    isMobileViewport,
    exploreState: state.exploreState,
    focusStop: stopsWorkflow.focusStop,
    locationStatus: state.location.status,
    pendingViewFocusRef,
    pendingExploreReturnFocusRef,
  })
  const navigation = appNavigation.state
  const activeView = appNavigation.activeView
  // Feature hooks own view behavior; App wires their bindings into the content components.
  const explorePanelFocus = useExplorePanelFocus({
    state: state.exploreState,
    selectedRouteId: state.selectedRouteId,
    sheetDetent: navigation.sheets.explore.detent,
    mobileSheet: isMobileViewport,
    active: activeView === 'explore',
    busRoutesAvailable: (state.transitIndex?.routes.length ?? 0) > 0,
    onVenueSelect: commands.selectVenue,
    onBuildingSelect: commands.selectBuilding,
    onOpenBusRoutes: () => {
      if (isMobileViewport) {
        appNavigation.dismissMobileSearch('explore')
      }
      commands.enterMobileRoutes()
    },
    onLeaveMobileRoutes: commands.leaveMobileRoutes,
    onFocusStop: appNavigation.openStopFromExplore,
    onBack: commands.back,
    onEscape: appNavigation.escapeExplore,
    onMinimize: () => appNavigation.dispatch({
      type: 'set-sheet-detent',
      view: 'explore',
      detent: 'collapsed',
      source: 'manual',
    }),
    onDismissMapPopup: commands.dismissMapPopup,
    onSearchCancel: () => appNavigation.dismissMobileSearch('explore'),
    onSearchResult: () => appNavigation.selectMobileSearchResult('explore'),
  })
  const planTripForm = usePlanTripForm({
    tripRequest: state.tripRequest,
    onSwap: commands.swapTripEndpoints,
    onSelectOriginEndpoint: commands.selectOriginEndpoint,
    onClearOriginEndpoint: commands.clearOriginEndpoint,
    onSelectDestinationEndpoint: commands.selectDestinationEndpoint,
    onClearDestinationEndpoint: commands.clearDestinationEndpoint,
    onClearTrip: commands.clearTrip,
    onPlanJourney: commands.searchPaths,
    onCancelOriginLocationRequest: commands.cancelOriginLocationRequest,
  })
  const navigationRef = useRef(navigation)
  const isMobileViewportRef = useRef(isMobileViewport)
  const commandsRef = useRef(commands)
  const dispatchNavigationRef = useRef(appNavigation.dispatch)
  const exploreModeRef = useRef(state.exploreState.mode)
  const displayedCandidatesRef = useRef(state.path.displayedCandidates)
  const { mobileSheetMetrics, mapInsets, navigationColumnWidth } = useMapOverlayLayout({
    commands,
    isMobileViewport,
    waypointPlacementActive: morePage === 'placing',
    navigation,
    mapShellRef,
    sheetPortalContainer,
    tripControlsRef,
    explorePanelRef,
    stopsSheetRef,
    mainNavigationRef,
    navigationColumnRef,
    onMeasurementsApplied: appNavigation.focusStopAfterMapLayout,
  })
  useMobilePlanRefit({
    commands,
    isMobileViewport,
    activeView: navigation.activeView,
    planDetent: navigation.sheets.plan.detent,
    hasJourney: state.path.displayedCandidates.length > 0,
  })
  useStopsEntryRefit({
    commands,
    isMobileViewport,
    activeView: navigation.activeView,
    stopsDetent: navigation.sheets.stops.detent,
    rememberedStopId: stopsWorkflow.state.focusedStopId,
  })
  useExploreEntryRefit({
    commands,
    isMobileViewport,
    activeView: navigation.activeView,
    exploreDetent: navigation.sheets.explore.detent,
    exploreMode: state.exploreState.mode,
    selectedVenueCode: state.exploreState.selectedVenue?.code ?? null,
    selectedBuildingId: state.exploreState.selectedBuildingId,
    selectedRouteId: state.selectedRouteId,
  })

  useLayoutEffect(() => {
    navigationRef.current = navigation
    isMobileViewportRef.current = isMobileViewport
    commandsRef.current = commands
    dispatchNavigationRef.current = appNavigation.dispatch
    exploreModeRef.current = state.exploreState.mode
    displayedCandidatesRef.current = state.path.displayedCandidates
  }, [
    appNavigation.dispatch,
    commands,
    isMobileViewport,
    navigation,
    state.path.displayedCandidates,
    state.exploreState.mode,
  ])

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
      ? explorePanelRef.current
      : activeView === 'stops'
        ? stopsSheetRef.current
        : tripControlsRef.current
    const target = root?.querySelector<HTMLElement>(
      'h2[tabindex="-1"], h3[tabindex="-1"], input:not([disabled]), select:not([disabled]), button:not([disabled])',
    )
    target?.focus()
  }, [activeView])

  useLayoutEffect(() => {
    if (activeView !== 'explore') return
    const target = pendingExploreReturnFocusRef.current
    pendingExploreReturnFocusRef.current = null
    if (target?.isConnected) target.focus({ preventScroll: true })
  }, [activeView])

  useLayoutEffect(() => {
    if (!focusTripControlAfterOverlayRef.current) return
    focusTripControlAfterOverlayRef.current = false
    const focusTarget = tripControlsRef.current?.querySelector<HTMLElement>(
      '.plan-content-panel input:not([disabled]), .plan-trip-line-main, .plan-content-panel select:not([disabled]), .plan-content-panel textarea:not([disabled]), .mobile-sheet-handle',
    )
    focusTarget?.focus()
  }, [isMobileViewport, navigation.sheets.plan.detent])

  const handleMapJourneyOptionSelected = useCallback((candidateKey: string): void => {
    if (!displayedCandidatesRef.current.some(({ candidateKey: key }) => key === candidateKey)) return

    const currentNavigation = navigationRef.current
    if (currentNavigation.activeView !== 'plan') {
      if (
        currentNavigation.activeView === 'explore' &&
        exploreModeRef.current === 'bus-routes'
      ) {
        commandsRef.current.suspendMobileRoutes()
      }
      // Map selection reveals Plan without the normal navigation focus jump.
      dispatchNavigationRef.current({ type: 'activate-plan-from-map' })
    }
    if (isMobileViewportRef.current) {
      pendingMapJourneySelectionRef.current = candidateKey
      setMapJourneySelectionRevision((revision) => revision + 1)
    }
  }, [])

  useLayoutEffect(() => {
    const candidateKey = pendingMapJourneySelectionRef.current
    if (!candidateKey) return
    if (!isMobileViewport || navigation.activeView !== 'plan') {
      pendingMapJourneySelectionRef.current = null
      return
    }
    if (!state.path.displayedCandidates.some(({ candidateKey: key }) => key === candidateKey)) {
      pendingMapJourneySelectionRef.current = null
      return
    }
    if (state.path.selectedCandidateKey !== candidateKey) return

    const content = tripControlsRef.current?.querySelector<HTMLElement>('.plan-content-panel')
    const summary = Array.from(content?.querySelectorAll<HTMLElement>('.journey-option-summary') ?? [])
      .find((element) => element.dataset.candidateKey === candidateKey)
    if (content && summary) {
      const contentBounds = content.getBoundingClientRect()
      const summaryBounds = summary.getBoundingClientRect()
      if (summaryBounds.top < contentBounds.top) {
        content.scrollTop += summaryBounds.top - contentBounds.top
      } else if (summaryBounds.bottom > contentBounds.bottom) {
        content.scrollTop += summaryBounds.bottom - contentBounds.bottom
      }
    }
    pendingMapJourneySelectionRef.current = null
  }, [
    isMobileViewport,
    mapJourneySelectionRevision,
    navigation.activeView,
    state.path.displayedCandidates,
    state.path.selectedCandidateKey,
  ])

  useEffect(() => {
    if (!mapContainer.current) return

    const mount = createNavigationSessionMount(mapContainer.current, {
      createMapSession,
      createNavigationSession,
      loadVenues: services.loadVenues,
      loadTransit: services.loadTransit,
      pathfinder: services.pathfinder,
      locationTracker: services.createLocationTracker(),
      onStopSelected: appNavigation.handleStopSelected,
      onMapStopInteraction: appNavigation.handleMapStopInteraction,
      onMapStopDestinationSet: appNavigation.openPlan,
      onMapJourneyOptionSelected: handleMapJourneyOptionSelected,
      onMapCenterChange: ([longitude, latitude]) => setMapCenter({ longitude, latitude }),
    })
    setSession(mount.session)

    return () => {
      mount.dispose()
    }
  }, [
    appNavigation.handleMapStopInteraction,
    appNavigation.handleStopSelected,
    appNavigation.openPlan,
    handleMapJourneyOptionSelected,
    services,
  ])

  const selectedRouteColor = state.selectedRouteColor ?? 'var(--bus-stop-default-color)'
  // Favourite stops are shown in the trip search before anything is typed.
  const planSearchSuggestions = useMemo(() => {
    const { transitIndex } = state
    if (!transitIndex) return []
    return stopsWorkflow.state.favoriteStopIds.flatMap((stopId) => {
      const stop = transitIndex.stopById.get(stopId)
      return stop
        ? [{
          endpoint: { kind: 'stop' as const, id: stop.id },
          label: stop.longName,
          detail: stop.shortName.trim().toLowerCase() === stop.id.trim().toLowerCase()
            ? ''
            : `${stop.shortName} (${stop.id})`,
        }]
        : []
    })
  }, [state, stopsWorkflow.state.favoriteStopIds])
  const planContentProps: AppViewsProps['views']['plan'] = {
    searchSuggestions: planSearchSuggestions,
    tripRequest: state.tripRequest,
    venues: state.venues,
    buildings: state.buildings,
    networkIndex: state.transitIndex,
    form: planTripForm,
    originLocationRequest: state.originLocationRequest,
    onSelectJourneyOption: commands.selectJourneyOption,
    onFitSelectedJourney: commands.fitSelectedJourney,
    onUseCurrentLocationForOrigin: commands.useCurrentLocationForOrigin,
    onCancelOriginLocationRequest: commands.cancelOriginLocationRequest,
    path: state.path,
    simulatedAtMs,
    onSearchFocus: () => appNavigation.beginMobileSearch('plan'),
    onSearchCancel: () => appNavigation.dismissMobileSearch('plan'),
    onSearchResult: () => appNavigation.selectMobileSearchResult('plan'),
  }
  const exploreContentProps: AppViewsProps['views']['explore'] = {
    state: state.exploreState,
    venues: state.venues,
    buildings: state.buildings,
    transitIndex: state.transitIndex,
    selectedRouteId: state.selectedRouteId,
    onRouteSelect: commands.selectMobileRoute,
    focus: explorePanelFocus,
    status: explorePanelStatus,
    onQueryChange: commands.setExploreQuery,
    onNavigateToBuilding: appNavigation.navigateToBuilding,
    onSelectBuildingPart: commands.selectBuildingPart,
    onNavigateToVenue: appNavigation.navigateToVenue,
    onRestore: () => appNavigation.dispatch({
      type: 'set-sheet-detent',
      view: 'explore',
      detent: 'partial',
    }),
    onSearchFocus: () => appNavigation.beginMobileSearch('explore'),
  }
  // Mode is captured when the stop opens from Explore, so the label matches where Back returns.
  const stopBackLabel = appNavigation.stopReturnTarget !== 'explore'
    ? 'Back to stops'
    : appNavigation.stopReturnMode === 'bus-routes'
      ? 'Back to bus routes'
      : 'Back to Find venue'
  const stopsContentProps: AppViewsProps['views']['stops'] = {
    selectedStop: stopsWorkflow.selectedStop,
    backLabel: stopBackLabel,
    stopListEntries: stopsWorkflow.stopListEntries,
    stopListLoading: stopsWorkflow.stopListLoading,
    noLiveData: stopsWorkflow.noLiveData,
    liveArrivalMessage: stopsWorkflow.liveArrivalMessage,
    selectedStopList: stopsWorkflow.state.list,
    selectedStopFavorite: stopsWorkflow.selectedStopFavorite,
    locationNotice: stopsWorkflow.locationNotice,
    onBackToStops: () => appNavigation.backFromStopDetails(stopsWorkflow.backToStops),
    onSelectOppositeStop: appNavigation.handleStopSelected,
    onSelectRoute: appNavigation.selectRouteFromStops,
    onNavigateToStop: appNavigation.navigateToStop,
    onSelectStopList: stopsWorkflow.selectStopList,
    onToggleFavorite: stopsWorkflow.toggleFavorite,
    onToggleExpanded: stopsWorkflow.toggleExpanded,
    onDismissLocationNotice: stopsWorkflow.dismissLocationNotice,
  }
  const selectView = (view: AppViewsProps['navigation']['activeView']): void => {
    if (isMoreOpen) {
      skipMoreFocusRestoreRef.current = true
      setMorePage('closed')
    }
    appNavigation.selectView(view, stopsWorkflow.state.list)
  }
  const openWaypoints = (): void => {
    personalWaypoints.refresh()
    setMorePage('waypoints')
  }
  const beginWaypointPlacement = (): void => {
    personalWaypoints.startDraft(mapCenter ?? { longitude: 103.7844, latitude: 1.2933 })
    setPlacementReturnsToForm(false)
    setMorePage('placing')
  }
  const cancelWaypointPlacement = (): void => {
    setMorePage(placementReturnsToForm ? 'creating' : 'waypoints')
  }
  const closeMore = (): void => {
    setMorePage((page) => page === 'menu' ? 'closed' : page === 'creating' ? 'waypoints' : 'menu')
  }
  const toggleMore = (): void => {
    setMorePage((page) => page === 'closed' ? 'menu' : 'closed')
  }

  useLayoutEffect(() => {
    if (isMoreOpen) {
      if (morePage === 'waypoints') {
        const addButton = personalWaypointsInitialFocusRef.current
        if (addButton && !addButton.disabled) addButton.focus()
        else moreInitialFocusRef.current?.focus()
      } else if (morePage === 'creating') personalWaypointNameRef.current?.focus()
      else moreInitialFocusRef.current?.focus()
    } else if (moreWasOpenRef.current && morePage === 'closed' && !skipMoreFocusRestoreRef.current) {
      moreEntryButtonRef.current?.focus()
    }
    moreWasOpenRef.current = isMoreOpen
    skipMoreFocusRestoreRef.current = false
  }, [isMoreOpen, morePage])

  useEffect(() => {
    if (morePage === 'closed') return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      if (morePage === 'placing') {
        setMorePage(placementReturnsToForm ? 'creating' : 'waypoints')
      } else {
        setMorePage((page) => page === 'menu' ? 'closed' : page === 'creating' ? 'waypoints' : 'menu')
      }
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [morePage, placementReturnsToForm])

  return (
    <main
      className="map-shell"
      ref={assignMapShellRef}
      data-more-open={isMoreOpen ? 'true' : 'false'}
      data-waypoint-placing={morePage === 'placing' ? 'true' : 'false'}
      style={{ '--desktop-navigation-width': `${navigationColumnWidth}px` } as CSSProperties}
    >
      <div className="map-stage">
        <div
          ref={mapContainer}
          className="map"
          style={{ '--map-overlay-bottom-inset': `${mapInsets.bottom}px` } as CSSProperties}
        />
        {morePage === 'placing' && <PersonalWaypointPlacement
          coordinate={personalWaypoints.draft.coordinate}
          mapCenter={mapCenter}
          onChange={(coordinate) => personalWaypoints.updateDraft({ coordinate })}
          onContinue={() => setMorePage('creating')}
          onCancel={cancelWaypointPlacement}
        />}
        {isCrosshairVisible && (
          <NearbyCrosshair insets={mapInsets} />
        )}
        <div className="map-control-stack">
          {JourneyTestTimeControl && (
            <Suspense fallback={null}>
              <JourneyTestTimeControl
                simulatedAtMs={simulatedAtMs}
                onApply={(instantMs) => {
                  testClock.set(instantMs)
                  setSimulatedAtMs(instantMs)
                  session?.replanPath()
                }}
                onReset={() => {
                  testClock.set(null)
                  setSimulatedAtMs(null)
                  session?.replanPath()
                }}
              />
            </Suspense>
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
            onLocate={stopsWorkflow.locateFromControl}
          />
          <MoreEntryButton
            expanded={isMoreOpen}
            buttonRef={(button) => {
              moreEntryButtonRef.current = button
            }}
            onClick={toggleMore}
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
              Other bus stop
            </div>
            <div><span className="legend-marker origin-marker" /> Origin</div>
            <div><span className="legend-marker destination-marker" /> Destination</div>
          </aside>
        </div>
      </div>
      <MobileSheetMetricsContext.Provider value={mobileSheetMetrics}>
        <AppViews
          isMobileViewport={isMobileViewport}
          waypointPlacementActive={morePage === 'placing'}
          sheetPortalContainer={sheetPortalContainer}
          navigation={navigation}
          onSelectView={selectView}
          morePanel={{
            open: isMoreOpen,
            title: morePage === 'waypoints' ? 'My waypoints'
              : morePage === 'creating' ? 'Add waypoint'
                : morePage === 'settings' ? 'Settings' : 'More',
            initialFocusRef: moreInitialFocusRef,
            onClose: closeMore,
            content: morePage === 'menu' ? <MoreMenu
              onOpenWaypoints={openWaypoints}
              onOpenSettings={() => setMorePage('settings')}
            /> : morePage === 'waypoints' ? <PersonalWaypointsHome
              readResult={personalWaypoints.readResult}
              status={personalWaypoints.status}
              onAdd={beginWaypointPlacement}
              initialFocusRef={personalWaypointsInitialFocusRef}
            /> : morePage === 'creating' ? <PersonalWaypointForm
              draft={personalWaypoints.draft}
              issues={personalWaypoints.issues}
              status={personalWaypoints.status}
              onChange={personalWaypoints.updateDraft}
              initialFocusRef={personalWaypointNameRef}
              onAdjustLocation={() => {
                setPlacementReturnsToForm(true)
                setMorePage('placing')
              }}
              onCancel={() => setMorePage('waypoints')}
              onSave={() => {
                if (personalWaypoints.save()) setMorePage('waypoints')
              }}
            /> : morePage === 'settings' ? (
              <SettingsContent
                themePreference={themePreference}
                onThemePreferenceChange={changeThemePreference}
                favoriteStops={stopsWorkflow.favoriteStops}
                onRemoveFavorite={stopsWorkflow.removeFavorite}
                onClearFavorites={stopsWorkflow.clearFavoriteStops}
                transitMetadata={state.transitIndex?.network.metadata ?? null}
                buildingSource={state.buildings?.source ?? null}
                dataVersion={__NUSGO_DATA_VERSION__}
              />
            ) : null,
          }}
          shells={{
            navigationColumnRef,
            mainNavigationRef,
            plan: {
              ref: tripControlsRef,
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
              ref: explorePanelRef,
              onDetentChange: (detent) => appNavigation.dispatch({
                type: 'set-sheet-detent',
                view: 'explore',
                detent,
                source: 'manual',
              }),
            },
            stops: {
              ref: stopsSheetRef,
              onDetentChange: (detent) => appNavigation.dispatch({
                type: 'set-sheet-detent',
                view: 'stops',
                detent,
                source: 'manual',
              }),
            },
          }}
          views={{
            plan: planContentProps,
            explore: exploreContentProps,
            stops: stopsContentProps,
          }}
        />
      </MobileSheetMetricsContext.Provider>
    </main>
  )
}

export default App
