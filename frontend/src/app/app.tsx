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
import { SettingsEntryButton } from '../ui/settings-entry-button'
import {
  applyTheme,
  getSystemTheme,
  subscribeToSystemThemeChanges,
  type ThemePreference,
} from '../ui/theme'
import { MobileSheetMetricsContext } from '../ui/mobile/mobile-sheet/mobile-sheet-metrics'
// Dev-only: import.meta.env.DEV is a build-time constant, so production builds drop this
// dynamic import, the control module and its CSS.
const JourneyTestTimeControl = import.meta.env.DEV
  ? lazy(() => import('../ui/journey-test-time-control').then((module) => ({ default: module.JourneyTestTimeControl })))
  : null
import { FitRoutesControl } from '../ui/fit-routes-control'
import { createJourneyTestClockStore } from './journey-test-clock-store'
import { createAppServices } from './composition/app-services'
import { AppViews, type AppViewsProps } from './composition/app-views'
import { useExplorePanelFocus } from '../features/explore/hooks/use-explore-panel-focus'
import { usePlanTripForm } from '../features/plan/hooks/use-plan-trip-form'
import { useStopsWorkflow } from '../features/stops/hooks/use-stops-workflow'
import { SettingsContent } from '../features/settings/settings-content'
import { useAppNavigation, useAppNavigationState } from './navigation/use-app-navigation'
import { useMapOverlayLayout } from './map-layout/use-map-overlay-layout'
import { useMobilePlanRefit } from './map-layout/use-mobile-plan-refit'
import type { ShuttleArrivalSnapshot } from '../domain/transit/arrivals'
import type { PublicBusArrivalSnapshot } from '../domain/transit/public-bus-arrivals'
import type { StopsArrivalLoader } from '../features/stops/hooks/use-stops-arrivals'
import type { StopsServiceWindowsLoader } from '../features/stops/hooks/use-stops-service-windows'

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const locationControlRef = useRef<HTMLDivElement>(null)
  const mapShellRef = useRef<HTMLElement>(null)
  const [sheetPortalContainer, setSheetPortalContainer] = useState<HTMLElement | null>(null)
  const tripControlsRef = useRef<HTMLElement>(null)
  const explorePanelRef = useRef<HTMLElement>(null)
  const stopsSheetRef = useRef<HTMLElement>(null)
  const mainNavigationRef = useRef<HTMLElement>(null)
  const settingsEntryButtonRef = useRef<HTMLButtonElement>(null)
  const settingsHeadingRef = useRef<HTMLHeadingElement>(null)
  const settingsWasOpenRef = useRef(false)
  const skipSettingsFocusRestoreRef = useRef(false)
  const navigationColumnRef = useRef<HTMLElement>(null)
  const pendingViewFocusRef = useRef<NavigationView | null>(null)
  const pendingExploreReturnFocusRef = useRef<HTMLElement | null>(null)
  const [session, setSession] = useState<NavigationSession | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [themePreference, setThemePreference] = useState<ThemePreference>('system')
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
      '.plan-content-panel input:not([disabled]), .plan-content-panel select:not([disabled]), .plan-content-panel textarea:not([disabled]), .mobile-sheet-handle',
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
  const planContentProps: AppViewsProps['views']['plan'] = {
    tripRequest: state.tripRequest,
    venues: state.venues,
    buildings: state.buildings,
    networkIndex: state.transitIndex,
    form: planTripForm,
    originLocationRequest: state.originLocationRequest,
    onSelectJourneyOption: commands.selectJourneyOption,
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
  const stopsContentProps: AppViewsProps['views']['stops'] = {
    selectedStop: stopsWorkflow.selectedStop,
    stopListEntries: stopsWorkflow.stopListEntries,
    stopListLoading: stopsWorkflow.stopListLoading,
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
    if (isSettingsOpen) {
      skipSettingsFocusRestoreRef.current = true
      setIsSettingsOpen(false)
    }
    appNavigation.selectView(view, stopsWorkflow.state.list)
  }
  const toggleSettings = (): void => {
    setIsSettingsOpen((open) => !open)
  }

  useLayoutEffect(() => {
    if (isSettingsOpen) {
      settingsHeadingRef.current?.focus()
    } else if (settingsWasOpenRef.current && !skipSettingsFocusRestoreRef.current) {
      settingsEntryButtonRef.current?.focus()
    }
    settingsWasOpenRef.current = isSettingsOpen
    skipSettingsFocusRestoreRef.current = false
  }, [isSettingsOpen])

  useEffect(() => {
    if (!isSettingsOpen) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      setIsSettingsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [isSettingsOpen])

  return (
    <main
      className="map-shell"
      ref={assignMapShellRef}
      data-settings-open={isSettingsOpen ? 'true' : 'false'}
      style={{ '--desktop-navigation-width': `${navigationColumnWidth}px` } as CSSProperties}
    >
      <div className="map-stage">
        <div
          ref={mapContainer}
          className="map"
          style={{ '--map-overlay-bottom-inset': `${mapInsets.bottom}px` } as CSSProperties}
        />
        {!isMobileViewport && !isSettingsOpen && stopsWorkflow.showNearbyCrosshair && (
          <NearbyCrosshair insets={mapInsets} />
        )}
        <div className="map-control-stack">
          {navigation.activeView === 'plan' &&
            state.path.status === 'ready' &&
            state.path.displayedCandidates.length > 0 && (
            <FitRoutesControl onFit={commands.fitJourneyRoutes} />
          )}
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
          <SettingsEntryButton
            expanded={isSettingsOpen}
            buttonRef={(button) => {
              settingsEntryButtonRef.current = button
            }}
            onClick={toggleSettings}
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
          sheetPortalContainer={sheetPortalContainer}
          navigation={navigation}
          onSelectView={selectView}
          settings={{
            open: isSettingsOpen,
            headingRef: settingsHeadingRef,
            onClose: () => setIsSettingsOpen(false),
            content: (
              <SettingsContent
                themePreference={themePreference}
                onThemePreferenceChange={setThemePreference}
                favoriteStops={stopsWorkflow.favoriteStops}
                onRemoveFavorite={stopsWorkflow.removeFavorite}
                onClearFavorites={stopsWorkflow.clearFavoriteStops}
                transitMetadata={state.transitIndex?.network.metadata ?? null}
                buildingSource={state.buildings?.source ?? null}
                dataVersion={__NAVUS_DATA_VERSION__}
              />
            ),
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
