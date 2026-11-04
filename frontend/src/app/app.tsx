import { PwaInstallSection } from './pwa-install-section'
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
import { PwaNotices } from './pwa-notices'
import { NearbyCrosshair } from '../ui/nearby-crosshair'
import { isFocusInsideLocationControl } from '../ui/location-control-focus'
import { createNavigationSession, type NavigationSession } from './navigation-session'
import {
  createNavigationSessionCommandAdapter,
  createNavigationSessionMount,
} from './navigation-session-mount'
import { useNavigationSession } from './use-navigation-session'
import { deriveExplorePanelStatus } from './explore-panel-status'
import {
  getIsMobileViewport,
  subscribeToMobileViewport,
  type MobileSheetDetent,
} from './navigation/navigation-state'
import type { NavigationView } from '../ui/navigation-view'
import { createMapSession } from '../infrastructure/map/session'
import { MoreEntryButton } from '../ui/more-entry-button'
import type { MorePanelPage } from '../ui/more-panel-surface'
import {
  applyTheme,
  getSystemTheme,
  readThemePreference,
  saveThemePreference,
  subscribeToSystemThemeChanges,
  type ThemePreference,
} from '../ui/theme'
import { MobileSheetMetricsContext } from '../ui/mobile/mobile-sheet/mobile-sheet-metrics'
import { Button } from '../ui/button'
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
import { useShuttleVehicles } from '../features/live-buses/hooks/use-shuttle-vehicles'
import { LiveBusToggle } from '../features/live-buses/components/live-bus-toggle'
import { SettingsContent } from '../features/settings/settings-content'
import type { MinuteFormat } from '../domain/trip/minute-format'
import {
  readMinuteFormatPreference,
  saveMinuteFormatPreference,
} from '../ui/minute-format-preference'
import { MoreMenu } from '../features/more/more-menu'
import { ReleaseNotes } from '../features/releases/release-notes'
import {
  PersonalWaypointForm,
  PersonalWaypointDetails,
  PersonalWaypointPlacement,
  PersonalWaypointsHome,
  usePersonalWaypointWorkflow,
  usePersonalWaypointCategoryVisibility,
} from '../features/waypoints/personal'
import { createLocalPersonalWaypointStore } from '../infrastructure/data/local-personal-waypoint-store'
import { createLocalPersonalWaypointCategoryVisibilityStore } from '../infrastructure/data/local-personal-waypoint-category-visibility-store'
import {
  filterPersonalWaypointsByCategoryVisibility,
  getPersonalWaypointCategoryOptions,
} from '../domain/waypoints/personal/personal-waypoint-category-visibility'
import { useAppNavigation, useAppNavigationState } from './navigation/use-app-navigation'
import { useMapOverlayLayout } from './map-layout/use-map-overlay-layout'
import { useMobilePlanRefit } from './map-layout/use-mobile-plan-refit'
import { useStopsEntryRefit } from './map-layout/use-stops-entry-refit'
import { useExploreEntryRefit } from './map-layout/use-explore-entry-refit'
import { DEFAULT_PERSONAL_WAYPOINT_COORDINATE } from '../domain/waypoints/personal/personal-waypoint'
import type { PersonalWaypoint } from '../domain/waypoints/personal/personal-waypoint'
import type { WaypointCoordinate } from '../domain/waypoints/waypoint'
import type { ShuttleArrivalSnapshot } from '../domain/transit/arrivals'
import type { PublicBusArrivalSnapshot } from '../domain/transit/public-bus-arrivals'
import type { StopsArrivalLoader } from '../features/stops/hooks/use-stops-arrivals'
import type { StopsServiceWindowsLoader } from '../features/stops/hooks/use-stops-service-windows'

interface PersonalWaypointPanelReturnTarget {
  readonly page: MorePanelPage
  readonly detent: MobileSheetDetent
  readonly focusTarget: HTMLElement | null
}

// Keep the selected place with the panel location that opened its details.
interface PersonalWaypointDetailsSelection {
  readonly waypointId: string
  readonly returnTarget: PersonalWaypointPanelReturnTarget
}

const EMPTY_PERSONAL_WAYPOINTS: readonly PersonalWaypoint[] = []

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapPresentationRef = useRef<HTMLDivElement>(null)
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
  const personalWaypointCategoryBackRef = useRef<HTMLButtonElement>(null)
  const personalWaypointCategoryPickerRef = useRef<HTMLButtonElement>(null)
  const personalWaypointNameRef = useRef<HTMLInputElement>(null)
  const moreWasOpenRef = useRef(false)
  const skipMoreFocusRestoreRef = useRef(false)
  const focusCategoryPickerAfterBackRef = useRef(false)
  const navigationColumnRef = useRef<HTMLElement>(null)
  const pendingViewFocusRef = useRef<NavigationView | null>(null)
  const pendingExploreReturnFocusRef = useRef<HTMLElement | null>(null)
  const [basemapUnavailable, setBasemapUnavailable] = useState(false)
  const [session, setSession] = useState<NavigationSession | null>(null)
  const [morePage, setMorePage] = useState<MorePanelPage>('closed')
  const [moreSheetDetent, setMoreSheetDetent] = useState<MobileSheetDetent>('partial')
  const [isEditingPersonalWaypoints, setIsEditingPersonalWaypoints] = useState(false)
  const [personalWaypointEditReturnPage, setPersonalWaypointEditReturnPage] = useState<'waypoints' | 'waypoint-details'>('waypoint-details')
  const [placementReturnPage, setPlacementReturnPage] = useState<'creating' | 'editing-waypoint' | null>(null)
  const [personalWaypointDetails, setPersonalWaypointDetails] = useState<PersonalWaypointDetailsSelection | null>(null)
  const selectedPersonalWaypointId = personalWaypointDetails?.waypointId ?? null
  const [selectedPersonalWaypointCategory, setSelectedPersonalWaypointCategory] = useState<string | null>(null)
  const pendingWaypointReturnFocusRef = useRef<HTMLElement | null>(null)
  const [personalWaypointStore] = useState(createLocalPersonalWaypointStore)
  const personalWaypoints = usePersonalWaypointWorkflow(personalWaypointStore)
  const [personalWaypointCategoryVisibilityStore] = useState(createLocalPersonalWaypointCategoryVisibilityStore)
  const personalWaypointCategoryVisibility = usePersonalWaypointCategoryVisibility(
    personalWaypointCategoryVisibilityStore,
  )
  const { openPicker: openCategoryPicker } = personalWaypointCategoryVisibility
  const updatePersonalWaypointDraft = personalWaypoints.updateDraft
  const cancelPersonalWaypointEdit = personalWaypoints.cancelEdit
  // Coordinate placement needs the full map stage, so keep the More panel inactive while it is open.
  const isMoreOpen = morePage !== 'closed' && morePage !== 'placing'
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference)
  const [minuteFormat, setMinuteFormat] = useState<MinuteFormat>(readMinuteFormatPreference)
  const [liveBusLayerEnabled, setLiveBusLayerEnabled] = useState(false)
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
  const [isMapMoving, setIsMapMoving] = useState(false)
  const focusTripControlAfterOverlayRef = useRef(false)
  const assignMapShellRef = useCallback((shell: HTMLElement | null): void => {
    mapShellRef.current = shell
    setSheetPortalContainer(shell)
  }, [])
  const changeThemePreference = useCallback((preference: ThemePreference): void => {
    saveThemePreference(preference)
    setThemePreference(preference)
  }, [])
  const changeMinuteFormat = useCallback((format: MinuteFormat): void => {
    saveMinuteFormatPreference(format)
    setMinuteFormat(format)
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
  const loadShuttleVehicles = useCallback(
    (routeIds: readonly string[], signal: AbortSignal) => (
      services.shuttleVehicleClient.getVehicles(routeIds, signal)
    ),
    [services],
  )
  const requestNearbyLocation = useCallback((): void => {
    session?.locateUser()
  }, [session])
  const stopsWorkflow = useStopsWorkflow({
    minuteFormat,
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
  const liveBusRouteIds = useMemo(() => {
    if (navigationState.state.activeView === 'stops') {
      return [...state.transitIndex?.routeIdsByStopId.get(stopsWorkflow.state.focusedStopId ?? '') ?? []].sort()
    }
    const routeIds = new Set<string>()
    if (navigationState.state.activeView === 'explore') {
      if (state.selectedRouteId) routeIds.add(state.selectedRouteId)
    } else {
      for (const leg of state.path.path?.legs ?? []) {
        if (leg.mode === 'shuttle') routeIds.add(leg.routeId)
      }
    }
    return [...routeIds].sort()
  }, [
    navigationState.state.activeView,
    state.path.path,
    state.selectedRouteId,
    state.transitIndex,
    stopsWorkflow.state.focusedStopId,
  ])
  const showLiveBusVehicles = liveBusLayerEnabled && liveBusRouteIds.length > 0
  const liveVehicles = useShuttleVehicles(
    loadShuttleVehicles,
    showLiveBusVehicles,
    liveBusRouteIds,
  )
  useEffect(() => {
    commands.setLiveVehicles(liveVehicles.snapshot?.vehicles ?? [], showLiveBusVehicles)
  }, [commands, liveVehicles.snapshot, showLiveBusVehicles])
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
  // A typed or pasted coordinate can be anywhere, so bring the pin into view as well as moving it.
  const applyTypedWaypointCoordinate = useCallback((coordinate: WaypointCoordinate): void => {
    updatePersonalWaypointDraft({ coordinate })
    commands.panToCoordinate([coordinate.longitude, coordinate.latitude])
  }, [commands, updatePersonalWaypointDraft])
  const focusPersonalWaypoint = useCallback((waypoint: PersonalWaypoint): void => {
    commands.focusPersonalWaypoint(waypoint)
  }, [commands])
  const returnFromWaypointDetails = useCallback((focusTarget?: HTMLElement | null): void => {
    const returnTarget = personalWaypointDetails?.returnTarget
    // Restore the originating control after the details page has closed.
    pendingWaypointReturnFocusRef.current = focusTarget === undefined
      ? returnTarget?.focusTarget ?? null
      : focusTarget
    setPersonalWaypointDetails(null)
    setMorePage(returnTarget?.page ?? 'waypoints')
    setMoreSheetDetent(returnTarget?.detent ?? 'full')
  }, [personalWaypointDetails])
  const openPersonalWaypointDetails = useCallback((
    waypointId: string,
    returnPage: MorePanelPage,
    returnDetent: MobileSheetDetent,
    trigger: HTMLElement,
  ): void => {
    setPersonalWaypointDetails({
      waypointId,
      returnTarget: {
        page: returnPage,
        detent: returnDetent,
        focusTarget: trigger,
      },
    })
    setMoreSheetDetent('full')
    setMorePage('waypoint-details')
  }, [])
  const openPersonalWaypointCategory = useCallback((category: string): void => {
    focusCategoryPickerAfterBackRef.current = false
    setSelectedPersonalWaypointCategory(category)
    openCategoryPicker()
  }, [openCategoryPicker])
  const backToPersonalWaypointCategories = useCallback((): void => {
    focusCategoryPickerAfterBackRef.current = true
    setSelectedPersonalWaypointCategory(null)
    openCategoryPicker()
  }, [openCategoryPicker])
  const handlePersonalWaypointMapSelection = useCallback((waypointId: string, trigger: HTMLButtonElement): void => {
    if (morePage === 'editing-waypoint' || morePage === 'placing') return
    if (personalWaypointDetails) {
      setPersonalWaypointDetails({ ...personalWaypointDetails, waypointId })
      return
    }
    openPersonalWaypointDetails(waypointId, morePage, moreSheetDetent, trigger)
  }, [morePage, moreSheetDetent, openPersonalWaypointDetails, personalWaypointDetails])
  const handlePersonalWaypointRowSelection = useCallback((waypointId: string, trigger: HTMLButtonElement): void => {
    openPersonalWaypointDetails(waypointId, 'waypoints', moreSheetDetent, trigger)
  }, [moreSheetDetent, openPersonalWaypointDetails])
  const personalWaypointsForMap = personalWaypoints.readResult.kind === 'ready'
    ? personalWaypoints.readResult.waypoints
    : EMPTY_PERSONAL_WAYPOINTS
  const personalWaypointCollection = personalWaypoints.readResult.kind === 'ready' &&
    personalWaypoints.readResult.rejectedRecords.count === 0
    ? personalWaypoints.readResult.waypoints
    : null
  const personalWaypointCategoryOptions = useMemo(
    () => getPersonalWaypointCategoryOptions(personalWaypointsForMap),
    [personalWaypointsForMap],
  )
  const activePersonalWaypointCategory = selectedPersonalWaypointCategory !== null &&
    personalWaypointCategoryOptions.some(({ category }) => category === selectedPersonalWaypointCategory)
    ? selectedPersonalWaypointCategory
    : null
  const visiblePersonalWaypointsForMap = useMemo(
    () => filterPersonalWaypointsByCategoryVisibility(
      personalWaypointsForMap,
      personalWaypointCategoryVisibility.hiddenCategories,
    ),
    [personalWaypointCategoryVisibility.hiddenCategories, personalWaypointsForMap],
  )
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
  useEffect(() => {
    commands.setPersonalWaypoints(
      visiblePersonalWaypointsForMap,
      morePage !== 'placing' && morePage !== 'editing-waypoint',
      handlePersonalWaypointMapSelection,
    )
  }, [commands, handlePersonalWaypointMapSelection, morePage, visiblePersonalWaypointsForMap])
  useEffect(() => {
    commands.setPersonalWaypointCollection(personalWaypointCollection)
  }, [commands, personalWaypointCollection])
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
    mapPresentationRef,
    sheetPortalContainer,
    tripControlsRef,
    explorePanelRef,
    stopsSheetRef,
    mainNavigationRef,
    navigationColumnRef,
    onMeasurementsApplied: appNavigation.focusStopAfterMapLayout,
    observeStopsPresentation: isCrosshairVisible && navigation.activeView === 'stops',
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
      onBasemapUnavailable: () => setBasemapUnavailable(true),
      loadVenues: services.loadVenues,
      loadTransit: services.loadTransit,
      pathfinder: services.pathfinder,
      locationTracker: services.createLocationTracker(),
      onStopSelected: appNavigation.handleStopSelected,
      onStopDetailsSelected: appNavigation.openStopDetailsFromMap,
      onMapStopInteraction: appNavigation.handleMapStopInteraction,
      onMapStopDestinationSet: appNavigation.openPlan,
      onMapJourneyOptionSelected: handleMapJourneyOptionSelected,
      onMapCenterChange: ([longitude, latitude]) => setMapCenter({ longitude, latitude }),
      onMapMovingChange: setIsMapMoving,
    })
    setSession(mount.session)

    return () => {
      mount.dispose()
    }
  }, [
    appNavigation.handleMapStopInteraction,
    appNavigation.handleStopSelected,
    appNavigation.openStopDetailsFromMap,
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
    personalWaypoints: personalWaypointCollection ?? EMPTY_PERSONAL_WAYPOINTS,
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
    setIsEditingPersonalWaypoints(false)
    appNavigation.selectView(view, stopsWorkflow.state.list)
  }
  const openWaypoints = (): void => {
    personalWaypoints.refresh()
    setIsEditingPersonalWaypoints(false)
    focusCategoryPickerAfterBackRef.current = false
    setSelectedPersonalWaypointCategory(null)
    setMoreSheetDetent('full')
    setMorePage('waypoints')
  }
  const openSettings = (): void => {
    setIsEditingPersonalWaypoints(false)
    setMoreSheetDetent('full')
    setMorePage('settings')
  }
  const openReleaseNotes = (): void => {
    setIsEditingPersonalWaypoints(false)
    setMoreSheetDetent('full')
    setMorePage('release-notes')
  }
  const beginWaypointCreation = (): void => {
    setIsEditingPersonalWaypoints(false)
    personalWaypoints.startDraft(mapCenter ?? DEFAULT_PERSONAL_WAYPOINT_COORDINATE)
    setPlacementReturnPage(null)
    setMorePage('creating')
  }
  const beginWaypointLocationAdjustment = (): void => {
    setPlacementReturnPage(morePage === 'editing-waypoint' ? 'editing-waypoint' : 'creating')
    setMorePage('placing')
  }
  const cancelWaypointPlacement = (): void => {
    const returnPage = placementReturnPage
    if (!returnPage) setIsEditingPersonalWaypoints(false)
    setPlacementReturnPage(null)
    setMoreSheetDetent('full')
    setMorePage(returnPage ?? 'waypoints')
  }
  const clearPersonalWaypoints = (): void => {
    personalWaypoints.clearAll()
    setIsEditingPersonalWaypoints(false)
  }
  const removePersonalWaypoint = (waypointId: string): boolean => {
    const removingLastWaypoint = personalWaypoints.readResult.kind === 'ready' &&
      personalWaypoints.readResult.waypoints.length === 1
    const removed = personalWaypoints.removeWaypoint(waypointId)
    if (removed && removingLastWaypoint) setIsEditingPersonalWaypoints(false)
    return removed
  }
  const deleteSelectedPersonalWaypoint = (): void => {
    if (!selectedPersonalWaypointId) return
    const returnTarget = personalWaypointDetails?.returnTarget
    if (!removePersonalWaypoint(selectedPersonalWaypointId)) return
    const focusTarget = returnTarget?.page === 'waypoints' && activePersonalWaypointCategory === null
      ? personalWaypointsInitialFocusRef.current
      : returnTarget?.page === 'closed'
        ? moreEntryButtonRef.current
        : moreInitialFocusRef.current
    returnFromWaypointDetails(focusTarget)
  }
  const goBackInMore = useCallback((): void => {
    if (morePage === 'placing') {
      const returnPage = placementReturnPage
      if (!returnPage) setIsEditingPersonalWaypoints(false)
      setPlacementReturnPage(null)
      setMorePage(returnPage ?? 'waypoints')
      setMoreSheetDetent('full')
      return
    }
    if (morePage === 'waypoint-details') {
      returnFromWaypointDetails()
      return
    }
    if (morePage === 'waypoints' && activePersonalWaypointCategory !== null) {
      backToPersonalWaypointCategories()
      return
    }
    if (morePage === 'editing-waypoint') {
      cancelPersonalWaypointEdit()
      setMorePage(personalWaypointEditReturnPage)
      setMoreSheetDetent('full')
      return
    }
    if (morePage === 'menu') {
      setMorePage('closed')
      setMoreSheetDetent('partial')
      return
    }
    if (morePage === 'release-notes' || morePage === 'settings') {
      setMorePage('menu')
      setMoreSheetDetent('partial')
      return
    }
    if (morePage === 'creating') {
      setMorePage('waypoints')
      setMoreSheetDetent('full')
      return
    }

    setMorePage('menu')
    setMoreSheetDetent('partial')
    setIsEditingPersonalWaypoints(false)
  }, [
    backToPersonalWaypointCategories,
    cancelPersonalWaypointEdit,
    morePage,
    personalWaypointEditReturnPage,
    placementReturnPage,
    returnFromWaypointDetails,
    activePersonalWaypointCategory,
  ])
  const closeMore = goBackInMore
  const toggleMore = (): void => {
    if (morePage === 'waypoint-details') {
      returnFromWaypointDetails()
      return
    }
    if (morePage === 'closed') {
      setMoreSheetDetent('partial')
      setMorePage('menu')
      return
    }
    setMorePage('closed')
    setMoreSheetDetent('partial')
    setIsEditingPersonalWaypoints(false)
  }

  const selectedPersonalWaypoint = personalWaypoints.readResult.kind === 'ready'
    ? personalWaypoints.readResult.waypoints.find(({ id }) => id === selectedPersonalWaypointId) ?? null
    : null
  const canManageSelectedPersonalWaypoint = personalWaypoints.readResult.kind === 'ready' &&
    personalWaypoints.readResult.rejectedRecords.count === 0 &&
    selectedPersonalWaypoint !== null
  const canEditPersonalWaypoints = personalWaypoints.readResult.kind === 'ready' &&
    personalWaypoints.readResult.rejectedRecords.count === 0 &&
    personalWaypoints.readResult.waypoints.length > 0
  const beginPersonalWaypointEdit = (
    waypoint: PersonalWaypoint,
    returnPage: 'waypoints' | 'waypoint-details',
  ): void => {
    if (!personalWaypoints.startEdit(waypoint)) return
    setPersonalWaypointEditReturnPage(returnPage)
    setMorePage('editing-waypoint')
    setMoreSheetDetent('full')
  }
  const editPersonalWaypointFromList = (waypointId: string): void => {
    if (personalWaypoints.readResult.kind !== 'ready') return
    const waypoint = personalWaypoints.readResult.waypoints.find(({ id }) => id === waypointId)
    if (waypoint) {
      setSelectedPersonalWaypointCategory(null)
      beginPersonalWaypointEdit(waypoint, 'waypoints')
    }
  }
  const personalWaypointHeaderAction = morePage === 'waypoints' && canEditPersonalWaypoints
    ? <Button
      className="more-panel-header-action"
      label={isEditingPersonalWaypoints ? 'Done' : 'Edit list'}
      variant="ghost"
      pressed={isEditingPersonalWaypoints}
      onClick={() => setIsEditingPersonalWaypoints((editing) => !editing)}
    />
    : undefined

  useLayoutEffect(() => {
    const pendingReturnFocus = pendingWaypointReturnFocusRef.current
    if (pendingReturnFocus) {
      pendingWaypointReturnFocusRef.current = null
      // Removing a waypoint can detach its row; fall back to a control in the restored view.
      if (pendingReturnFocus.isConnected) pendingReturnFocus.focus()
      else if (isMoreOpen && morePage === 'waypoints' && activePersonalWaypointCategory !== null) {
        personalWaypointCategoryBackRef.current?.focus()
      } else if (isMoreOpen && morePage === 'waypoints') personalWaypointsInitialFocusRef.current?.focus()
      else if (isMoreOpen) moreInitialFocusRef.current?.focus()
      else moreEntryButtonRef.current?.focus()
      moreWasOpenRef.current = isMoreOpen
      skipMoreFocusRestoreRef.current = false
      return
    }

    if (isMoreOpen) {
      if (morePage === 'waypoints') {
        if (focusCategoryPickerAfterBackRef.current) {
          focusCategoryPickerAfterBackRef.current = false
          personalWaypointCategoryPickerRef.current?.focus()
        } else if (activePersonalWaypointCategory !== null) {
          personalWaypointCategoryBackRef.current?.focus()
        } else {
          const addButton = personalWaypointsInitialFocusRef.current
          if (addButton && !addButton.disabled) addButton.focus()
          else moreInitialFocusRef.current?.focus()
        }
      } else if (morePage === 'creating' || morePage === 'editing-waypoint') {
        if (isMobileViewport) moreInitialFocusRef.current?.focus()
        else personalWaypointNameRef.current?.focus()
      } else moreInitialFocusRef.current?.focus()
    } else if (moreWasOpenRef.current && morePage === 'closed' && !skipMoreFocusRestoreRef.current) {
      moreEntryButtonRef.current?.focus()
    }
    moreWasOpenRef.current = isMoreOpen
    skipMoreFocusRestoreRef.current = false
  }, [activePersonalWaypointCategory, isMobileViewport, isMoreOpen, morePage])

  useEffect(() => {
    if (morePage === 'closed') return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (event.target instanceof Element && event.target.closest('[data-keyboard-reordering="true"], [role="listbox"]')) return
      event.preventDefault()
      event.stopPropagation()
      goBackInMore()
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [goBackInMore, morePage])

  return (
    <main
      className="map-shell"
      ref={assignMapShellRef}
      data-more-open={isMoreOpen ? 'true' : 'false'}
      data-waypoint-placing={morePage === 'placing' ? 'true' : 'false'}
      style={{ '--desktop-navigation-width': `${navigationColumnWidth}px` } as CSSProperties}
    >
      <div className="map-stage" ref={mapPresentationRef}>
        <PwaNotices basemapUnavailable={basemapUnavailable} />
        <div
          ref={mapContainer}
          className="map"
          style={{ '--map-overlay-bottom-inset': `var(--map-sheet-presentation-bottom-inset, ${mapInsets.bottom}px)` } as CSSProperties}
        />
        {morePage === 'placing' && <PersonalWaypointPlacement
          coordinate={personalWaypoints.draft.coordinate}
          onUseMapCentre={mapCenter && !isMapMoving ? () => updatePersonalWaypointDraft({ coordinate: mapCenter }) : undefined}
          onApplyCoordinate={applyTypedWaypointCoordinate}
          onContinue={() => setMorePage(placementReturnPage ?? 'creating')}
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
          <div className="map-control-actions">
            <LiveBusToggle
              enabled={liveBusLayerEnabled}
              onToggle={setLiveBusLayerEnabled}
            />
            <div className="map-control-action-slot">
              <LocationControl
                visible={!isMobileViewport || !(
                  navigation.activeView === 'plan' && navigation.sheets.plan.detent !== 'collapsed'
                )}
                onRootChange={(root) => {
                  locationControlRef.current = root
                }}
                searching={state.location.status === 'requesting'}
                onLocate={stopsWorkflow.locateFromControl}
              />
            </div>
            <MoreEntryButton
              expanded={isMoreOpen}
              buttonRef={(button) => {
                moreEntryButtonRef.current = button
              }}
              onClick={toggleMore}
            />
            {liveBusLayerEnabled && (
              liveVehicles.status === 'error' ||
              (liveVehicles.snapshot?.unavailableRouteIds?.length ?? 0) > 0
            ) && <p className="live-bus-status" role="status">Live buses unavailable</p>}
          </div>
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
            page: morePage,
            detent: moreSheetDetent,
            statusMessage: personalWaypoints.statusKind === 'success' ? personalWaypoints.status : null,
            statusRevision: personalWaypoints.statusRevision,
            headerAction: personalWaypointHeaderAction,
            title: morePage === 'waypoints'
              ? activePersonalWaypointCategory ?? 'My waypoints'
              : morePage === 'waypoint-details' ? 'Waypoint details'
              : morePage === 'creating' ? 'Add waypoint'
                : morePage === 'placing' ? 'Adjust location'
                  : morePage === 'editing-waypoint' ? 'Edit waypoint'
                    : morePage === 'settings' ? 'Settings'
                      : morePage === 'release-notes' ? 'Release notes' : 'More',
            initialFocusRef: moreInitialFocusRef,
            onClose: closeMore,
            onDetentChange: setMoreSheetDetent,
            content: morePage === 'menu' ? <MoreMenu installSection={<PwaInstallSection />}
              waypointCount={personalWaypoints.readResult.kind === 'ready'
                ? personalWaypoints.readResult.waypoints.length
                : null}
              onOpenWaypoints={openWaypoints}
              onOpenSettings={openSettings}
              onOpenReleaseNotes={openReleaseNotes}
            /> : morePage === 'waypoints' ? <PersonalWaypointsHome
              readResult={personalWaypoints.readResult}
              status={personalWaypoints.statusKind === 'problem' ? personalWaypoints.status : null}
              onAdd={beginWaypointCreation}
              onFocusWaypoint={focusPersonalWaypoint}
              editing={isEditingPersonalWaypoints}
              onSelectWaypoint={handlePersonalWaypointRowSelection}
              onEditWaypoint={editPersonalWaypointFromList}
              onRemove={removePersonalWaypoint}
              onMove={personalWaypoints.moveWaypoint}
              onClearAll={clearPersonalWaypoints}
              onResetUnreadableData={personalWaypoints.resetUnreadableData}
              onDiscardRejectedRecords={personalWaypoints.discardRejectedRecords}
              categoryOptions={personalWaypointCategoryOptions}
              hiddenCategories={personalWaypointCategoryVisibility.hiddenCategories}
              draftHiddenCategories={personalWaypointCategoryVisibility.draftHiddenCategories}
              categoryPickerOpen={personalWaypointCategoryVisibility.pickerOpen}
              selectedCategory={activePersonalWaypointCategory}
              categoryVisibilityStatus={personalWaypointCategoryVisibility.status}
              onSetCategoryVisible={personalWaypointCategoryVisibility.setCategoryVisible}
              onOpenCategory={openPersonalWaypointCategory}
              onBackToCategories={backToPersonalWaypointCategories}
              onToggleCategoryPicker={personalWaypointCategoryVisibility.togglePicker}
              onClearCategoryVisibilityChanges={personalWaypointCategoryVisibility.clearCategoryVisibilityChanges}
              onCancelCategoryVisibilityChanges={personalWaypointCategoryVisibility.cancelCategoryVisibilityChanges}
              onDoneCategoryVisibilityChanges={personalWaypointCategoryVisibility.saveCategoryVisibilityChanges}
              categoryBackButtonRef={personalWaypointCategoryBackRef}
              categoryPickerTriggerRef={personalWaypointCategoryPickerRef}
              initialFocusRef={personalWaypointsInitialFocusRef}
            /> : morePage === 'waypoint-details' ? <PersonalWaypointDetails
              waypoint={selectedPersonalWaypoint}
              canManage={canManageSelectedPersonalWaypoint}
              onEdit={() => {
                if (!selectedPersonalWaypoint || !canManageSelectedPersonalWaypoint) return
                beginPersonalWaypointEdit(selectedPersonalWaypoint, 'waypoint-details')
              }}
              onDelete={deleteSelectedPersonalWaypoint}
            /> : morePage === 'creating' || morePage === 'editing-waypoint' ? <PersonalWaypointForm
              draft={personalWaypoints.draft}
              categoryOptions={personalWaypointCategoryOptions}
              issues={personalWaypoints.issues}
              status={personalWaypoints.status}
              editConflict={morePage === 'editing-waypoint' ? personalWaypoints.editConflict : null}
              onChange={personalWaypoints.updateDraft}
              initialFocusRef={personalWaypointNameRef}
              submitLabel={morePage === 'editing-waypoint' ? 'Save changes' : 'Save waypoint'}
              onAdjustLocation={beginWaypointLocationAdjustment}
              onCancel={() => {
                if (morePage === 'editing-waypoint') {
                  cancelPersonalWaypointEdit()
                  setMorePage(personalWaypointEditReturnPage)
                } else {
                  setIsEditingPersonalWaypoints(false)
                  setMorePage('waypoints')
                }
              }}
              onSave={() => {
                if (personalWaypoints.save()) {
                  if (morePage === 'editing-waypoint') setMorePage(personalWaypointEditReturnPage)
                  else {
                    setIsEditingPersonalWaypoints(false)
                    setMorePage('waypoints')
                  }
                }
              }}
            /> : morePage === 'release-notes' ? <ReleaseNotes /> : morePage === 'settings' ? (
              <SettingsContent
                themePreference={themePreference}
                onThemePreferenceChange={changeThemePreference}
                minuteFormat={minuteFormat}
                onMinuteFormatChange={changeMinuteFormat}
                favoriteStops={stopsWorkflow.favoriteStops}
                onMoveFavorite={stopsWorkflow.reorderFavorite}
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
