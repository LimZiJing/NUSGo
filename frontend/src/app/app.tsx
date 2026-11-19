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
import { RainroomAtmosphere } from '../ui/themes/rainroom'
import { isFocusInsideLocationControl } from '../ui/location-control-focus'
import { createNavigationSession, type NavigationSession } from './navigation-session'
import {
  createNavigationSessionCommandAdapter,
  createNavigationSessionMount,
} from './navigation-session-mount'
import { useNavigationSession } from './use-navigation-session'
import { deriveExplorePanelStatus } from './explore-panel-status'
import { getIsMobileViewport } from '../ui/mobile/mobile-viewport'
import {
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
import { ConfirmDialog } from '../ui/confirm-dialog'
import { MobileSheetMetricsContext } from '../ui/mobile/mobile-sheet/mobile-sheet-metrics'
import {
  WAYPOINT_DETAILS_PARTIAL_EXTENT,
  createMobileSheetSnapPoints,
  getMobileSheetOccupiedHeight,
} from '../ui/mobile/mobile-sheet/mobile-sheet-snap-points'
import type { MapCameraSnapshot, MapViewportInsets } from './contracts/map'
import { MAP_OVERLAY_MARGIN } from './map-camera'
// Dev-only: import.meta.env.DEV is a build-time constant, so production builds drop this
// dynamic import, the control module and its CSS.
const JourneyTestTimeControl = import.meta.env.DEV
  ? lazy(() => import('../ui/journey-test-time-control').then((module) => ({ default: module.JourneyTestTimeControl })))
  : null
import { createJourneyTestClockStore } from './journey-test-clock-store'
import { createAppServices } from './composition/app-services'
import { AppViews, type AppViewsProps } from './composition/app-views'
import { StopsWorkspace, type StopsWorkspaceController, type StopsWorkspaceState } from './composition/stops-workspace'
import { useExplorePanelFocus } from '../features/explore/hooks/use-explore-panel-focus'
import { usePlanTripForm } from '../features/plan/hooks/use-plan-trip-form'
import { useShuttleVehicles } from '../features/live-buses/hooks/use-shuttle-vehicles'
import { LiveBusToggle } from '../features/live-buses/components/live-bus-toggle'
import { SettingsContent } from '../features/settings/settings-content'
import { getSettingsSectionTitle, type SettingsSectionId } from '../features/settings/settings-section'
import { buildBasePathUrl } from '../infrastructure/data/json'
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
  PersonalWaypointListActions,
  usePersonalWaypointWorkflow,
  usePersonalWaypointCategoryVisibility,
  usePersonalWaypointEditSession,
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
import { isValidLocationCoordinates } from '../domain/location/coordinates'
import { createPersonalWaypointTripEndpoint } from '../domain/trip/personal-waypoint-endpoints'
import type { PersonalWaypoint } from '../domain/waypoints/personal/personal-waypoint'
import { CommunityWaypointPanel } from '../features/waypoints/community/community-waypoint-panel'
import { CommunityWaypointSubmissionForm } from '../features/waypoints/community/submission/form'
import { useCommunityWaypointDiscovery } from '../features/waypoints/community/use-community-waypoint-discovery'
import type { CommunityWaypoint } from '@nusgo/shared/waypoints/community'
import type { WaypointCoordinate } from '@nusgo/shared/waypoints/waypoint'
import type { ShuttleArrivalSnapshot } from '../domain/transit/arrivals'
import type { PublicBusArrivalSnapshot } from '../domain/transit/public-bus-arrivals'
import type { StopsArrivalLoader } from '../features/stops/hooks/use-stops-arrivals'
import type { StopsServiceWindowsLoader } from '../features/stops/hooks/use-stops-service-windows'

interface PersonalWaypointPanelReturnTarget {
  readonly page: MorePanelPage
  readonly detent: MobileSheetDetent
  readonly focusTarget: HTMLElement | null
  /** Accessible name of the control that opened details, so the restored list can find it again. */
  readonly focusLabel: string | null
  /** The exact camera captured before details first focused the waypoint, so closing can return to it. */
  readonly camera: MapCameraSnapshot | null
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
  // True while the edit-mode command bar is showing and the pending list owns the screen.
  const [personalWaypointsEditing, setPersonalWaypointsEditing] = useState(false)
  const [pendingEditDiscard, setPendingEditDiscard] = useState(false)
  const [personalWaypointEditRevision, setPersonalWaypointEditRevision] = useState(0)
  // The outcome of the last confirmed list edit, shown in the popup with its revision.
  const [personalWaypointEditMessage, setPersonalWaypointEditMessage] = useState<string | null>(null)
  const [selectedSettingsSection, setSelectedSettingsSection] = useState<SettingsSectionId | null>(null)
  const [hasPersonalWaypointSearchFilter, setHasPersonalWaypointSearchFilter] = useState(false)
  const [personalWaypointEditReturnPage, setPersonalWaypointEditReturnPage] = useState<'waypoints' | 'waypoint-details'>('waypoint-details')
  const [placementReturnPage, setPlacementReturnPage] = useState<'creating' | 'editing-waypoint' | null>(null)
  // Set while a changed waypoint draft is waiting on Keep editing / Discard changes.
  const [pendingDraftLeave, setPendingDraftLeave] = useState<null | 'back' | 'cancel'>(null)
  const [personalWaypointDetails, setPersonalWaypointDetails] = useState<PersonalWaypointDetailsSelection | null>(null)
  const selectedPersonalWaypointId = personalWaypointDetails?.waypointId ?? null
  const pendingWaypointReturnFocusRef = useRef<HTMLElement | null>(null)
  // A list row unmounts with the page it opened details from, so its label re-finds the row once
  // the list is back instead of leaving focus on whatever happens to be first.
  const pendingWaypointReturnFocusLabelRef = useRef<string | null>(null)
  const [communitySubmissionWaypoint, setCommunitySubmissionWaypoint] = useState<CommunityWaypoint | null>(null)
  const [communitySubmissionCoordinate, setCommunitySubmissionCoordinate] = useState<WaypointCoordinate>(
    DEFAULT_PERSONAL_WAYPOINT_COORDINATE,
  )
  const [communitySubmissionLocationStatus, setCommunitySubmissionLocationStatus] = useState<'locating' | 'ready' | 'required'>('required')
  const [communitySubmissionLocationAccuracy, setCommunitySubmissionLocationAccuracy] = useState<number | null>(null)
  const [communitySubmissionReturnPage, setCommunitySubmissionReturnPage] = useState<'menu' | 'explore'>('menu')
  const [isCommunitySubmissionPending, setIsCommunitySubmissionPending] = useState(false)
  const communitySubmissionReturnFocusRef = useRef<HTMLElement | null>(null)
  const communitySubmissionPlacementFocusRef = useRef<HTMLButtonElement | null>(null)
  const [personalWaypointStore] = useState(createLocalPersonalWaypointStore)
  const personalWaypoints = usePersonalWaypointWorkflow(personalWaypointStore)
  const personalWaypointEdits = usePersonalWaypointEditSession(personalWaypointStore)
  const [personalWaypointCategoryVisibilityStore] = useState(createLocalPersonalWaypointCategoryVisibilityStore)
  const personalWaypointCategoryVisibility = usePersonalWaypointCategoryVisibility(
    personalWaypointCategoryVisibilityStore,
  )
  const updatePersonalWaypointDraft = personalWaypoints.updateDraft
  const cancelPersonalWaypointEdit = personalWaypoints.cancelEdit
  // Coordinate placement needs the full map stage, so keep the More panel inactive while it is open.
  const waypointPlacementActive = morePage === 'placing' || morePage === 'community-placing'
  const isMoreOpen = morePage !== 'closed' && !waypointPlacementActive
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference)
  const [minuteFormat, setMinuteFormat] = useState<MinuteFormat>(readMinuteFormatPreference)
  const [liveBusLayerEnabled, setLiveBusLayerEnabled] = useState(false)
  const [simulatedAtMs, setSimulatedAtMs] = useState<number | null>(null)
  const [testClock] = useState(createJourneyTestClockStore)
  const [services] = useState(() => createAppServices({ journeyTestClock: testClock }))
  const communityDiscovery = useCommunityWaypointDiscovery(services.loadCommunityWaypoints)
  const [communityExploreActive, setCommunityExploreActive] = useState(false)

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
  const currentLocationFix = state.location.status === 'tracking' && state.location.latestFix &&
    isValidLocationCoordinates(state.location.latestFix.longitude, state.location.latestFix.latitude)
    ? state.location.latestFix
    : null
  if (
    morePage === 'community-submission' && communitySubmissionWaypoint === null &&
    communitySubmissionLocationStatus === 'locating'
  ) {
    const { status, latestFix } = state.location
    if (status === 'tracking' && latestFix && isValidLocationCoordinates(latestFix.longitude, latestFix.latitude)) {
      setCommunitySubmissionCoordinate({ longitude: latestFix.longitude, latitude: latestFix.latitude })
      setCommunitySubmissionLocationAccuracy(latestFix.accuracy)
      setCommunitySubmissionLocationStatus('ready')
    } else if (
      status === 'denied' || status === 'unavailable' || status === 'timeout' || status === 'invalid'
    ) {
      setCommunitySubmissionLocationStatus('required')
    }
  }
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
  const stopsWorkspaceRef = useRef<StopsWorkspaceController>(null)
  const [stopsPanelState, setStopsPanelState] = useState<StopsWorkspaceState>(() => ({
    focusedStopId: null,
    favoriteStops: [],
    selectedStopList: 'nearby',
  }))
  const publishStopsPanelState = useCallback((next: StopsWorkspaceState): void => {
    setStopsPanelState((current) => (
      current.focusedStopId === next.focusedStopId &&
      current.favoriteStops === next.favoriteStops &&
      current.selectedStopList === next.selectedStopList
        ? current
        : next
    ))
  }, [])
  const focusStop = useCallback((stopId: string): void => {
    stopsWorkspaceRef.current?.focusStop(stopId)
  }, [])
  const reorderFavorite = useCallback((stopId: string, neighborId: string): void => {
    stopsWorkspaceRef.current?.reorderFavorite(stopId, neighborId)
  }, [])
  const removeFavorite = useCallback((stopId: string): void => {
    stopsWorkspaceRef.current?.removeFavorite(stopId)
  }, [])
  const clearFavoriteStops = useCallback((): void => {
    stopsWorkspaceRef.current?.clearFavoriteStops()
  }, [])
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
  const publishNearbyHighlight = useCallback((stopIds: readonly string[]): void => {
    commands.setNearbyStopHighlight(stopIds)
  }, [commands])
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
  const liveBusRouteIds = useMemo(() => {
    if (navigationState.state.activeView === 'stops') {
      return [...state.transitIndex?.routeIdsByStopId.get(stopsPanelState.focusedStopId ?? '') ?? []].sort()
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
    stopsPanelState.focusedStopId,
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
  const isCrosshairVisible = !isMoreOpen && !waypointPlacementActive &&
    navigationState.state.activeView === 'stops' && stopsPanelState.selectedStopList === 'nearby'
  useLayoutEffect(() => {
    commands.setVisibleCenterZoom(isCrosshairVisible)
  }, [commands, isCrosshairVisible])
  const handlePersonalWaypointMapChange = useCallback((coordinate: readonly [number, number]): void => {
    updatePersonalWaypointDraft({
      coordinate: { longitude: coordinate[0], latitude: coordinate[1] },
    })
  }, [updatePersonalWaypointDraft])
  const handleCommunityWaypointMapChange = useCallback((coordinate: readonly [number, number]): void => {
    setCommunitySubmissionCoordinate({ longitude: coordinate[0], latitude: coordinate[1] })
    setCommunitySubmissionLocationStatus('ready')
    setCommunitySubmissionLocationAccuracy(null)
  }, [])
  // A typed or pasted coordinate can be anywhere, so bring the pin into view as well as moving it.
  const applyTypedWaypointCoordinate = useCallback((coordinate: WaypointCoordinate): void => {
    updatePersonalWaypointDraft({ coordinate })
    commands.panToCoordinate([coordinate.longitude, coordinate.latitude])
  }, [commands, updatePersonalWaypointDraft])
  const applyTypedCommunityWaypointCoordinate = useCallback((coordinate: WaypointCoordinate): void => {
    setCommunitySubmissionCoordinate(coordinate)
    setCommunitySubmissionLocationStatus('ready')
    setCommunitySubmissionLocationAccuracy(null)
    commands.panToCoordinate([coordinate.longitude, coordinate.latitude])
  }, [commands])
  const returnFromWaypointDetails = useCallback((focusTarget?: HTMLElement | null): void => {
    const returnTarget = personalWaypointDetails?.returnTarget
    // Restore the originating control after the details page has closed.
    pendingWaypointReturnFocusRef.current = focusTarget === undefined
      ? returnTarget?.focusTarget ?? null
      : focusTarget
    // The selected row is replaced by its details page, so remember what it was called and look
    // for the same row again once the list is back.
    const restoreLabel = returnTarget?.focusLabel ?? null
    pendingWaypointReturnFocusLabelRef.current = focusTarget === undefined ? restoreLabel : null
    setPersonalWaypointDetails(null)
    setMorePage(returnTarget?.page ?? 'waypoints')
    setMoreSheetDetent(returnTarget?.detent ?? 'full')
    // The snapshot was taken before details first focused the waypoint, so this is exactly the view
    // the person left, even if they panned while details were open.
    if (returnTarget?.camera) commands.restoreCamera(returnTarget.camera)
  }, [commands, personalWaypointDetails])
  const openPersonalWaypointDetails = useCallback((
    waypointId: string,
    returnPage: MorePanelPage,
    returnDetent: MobileSheetDetent,
    trigger: HTMLElement,
  ): void => {
    // Read the camera before any focus moves it, and keep it with the return target.
    const camera = session ? commands.captureCamera() : null
    setPersonalWaypointDetails({
      waypointId,
      returnTarget: {
        page: returnPage,
        detent: returnDetent,
        focusTarget: trigger,
        focusLabel: trigger.getAttribute('aria-label'),
        camera,
      },
    })
    // Details keep the map in view, so the sheet rests at its own 60% partial extent.
    setMoreSheetDetent('partial')
    setMorePage('waypoint-details')
  }, [commands, session])
  const handlePersonalWaypointMapSelection = useCallback((waypointId: string, trigger: HTMLButtonElement): void => {
    // A marker opens details, except while a place is being edited or the list is mid-transaction:
    // either would replace screens the person is working in.
    if (morePage === 'editing-waypoint' || waypointPlacementActive || personalWaypointsEditing) return
    if (personalWaypointDetails) {
      // Switching to another place keeps the snapshot and return page captured on first open.
      setPersonalWaypointDetails({ ...personalWaypointDetails, waypointId })
      return
    }
    openPersonalWaypointDetails(waypointId, morePage, moreSheetDetent, trigger)
  }, [morePage, moreSheetDetent, openPersonalWaypointDetails, personalWaypointDetails, personalWaypointsEditing, waypointPlacementActive])
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
  const visiblePersonalWaypointsForMap = useMemo(
    () => filterPersonalWaypointsByCategoryVisibility(
      personalWaypointsForMap,
      personalWaypointCategoryVisibility.hiddenCategories,
    ),
    [personalWaypointCategoryVisibility.hiddenCategories, personalWaypointsForMap],
  )
  // App composition routes the temporary map pin to the active waypoint workflow.
  useEffect(() => {
    const isCommunityPlacement = morePage === 'community-placing'
    const isPersonalPlacement = morePage === 'placing'
    const visible = isCommunityPlacement || isPersonalPlacement || morePage === 'creating'
    const selectedCoordinate = isCommunityPlacement
      ? communitySubmissionCoordinate
      : personalWaypoints.draft.coordinate
    const coordinate = visible
      ? [selectedCoordinate.longitude, selectedCoordinate.latitude] as const
      : null
    commands.setWaypointPlacement(
      coordinate,
      isCommunityPlacement || isPersonalPlacement,
      isCommunityPlacement ? handleCommunityWaypointMapChange : handlePersonalWaypointMapChange,
    )
  }, [
    commands,
    communitySubmissionCoordinate,
    handleCommunityWaypointMapChange,
    handlePersonalWaypointMapChange,
    morePage,
    personalWaypoints.draft.coordinate,
  ])
  useEffect(() => () => {
    commands.setWaypointPlacement(null, false, handlePersonalWaypointMapChange)
  }, [commands, handlePersonalWaypointMapChange])
  useEffect(() => {
    commands.setPersonalWaypoints(
      visiblePersonalWaypointsForMap,
      !waypointPlacementActive && morePage !== 'editing-waypoint',
      handlePersonalWaypointMapSelection,
    )
  }, [commands, handlePersonalWaypointMapSelection, morePage, visiblePersonalWaypointsForMap, waypointPlacementActive])
  useEffect(() => {
    commands.setPersonalWaypointCollection(personalWaypointCollection)
  }, [commands, personalWaypointCollection])
  const appNavigation = useAppNavigation({
    ...navigationState,
    commands,
    isMobileViewport,
    exploreState: state.exploreState,
    focusStop,
    locationStatus: state.location.status,
    pendingViewFocusRef,
    pendingExploreReturnFocusRef,
  })
  const navigation = appNavigation.state
  const activeView = appNavigation.activeView
  const dispatchNavigation = appNavigation.dispatch
  const selectNavigationView = appNavigation.selectView
  const communityWaypoints = communityDiscovery.waypoints
  const selectCommunityWaypoint = communityDiscovery.selectWaypoint
  const communityMarkersEnabled = !waypointPlacementActive && !isMoreOpen
  const handleCommunityWaypointMapSelection = useCallback((
    waypointId: string,
    trigger: HTMLButtonElement,
  ): void => {
    const waypoint = communityWaypoints.find(({ id }) => id === waypointId)
    if (!waypoint || !communityMarkersEnabled) return
    selectCommunityWaypoint(waypointId, trigger)
    setCommunityExploreActive(true)
    if (isMobileViewport) {
      dispatchNavigation({ type: 'set-sheet-detent', view: 'explore', detent: 'full' })
    }
    selectNavigationView('explore')
  }, [communityMarkersEnabled, communityWaypoints, dispatchNavigation, isMobileViewport, selectCommunityWaypoint, selectNavigationView])
  useEffect(() => {
    commands.setCommunityWaypoints(
      communityMarkersEnabled ? communityDiscovery.visibleWaypoints : [],
      handleCommunityWaypointMapSelection,
    )
  }, [commands, communityDiscovery.visibleWaypoints, communityMarkersEnabled, handleCommunityWaypointMapSelection])
  useEffect(() => () => {
    commands.setCommunityWaypoints([], handleCommunityWaypointMapSelection)
  }, [commands, handleCommunityWaypointMapSelection])
  const beginCommunityWaypointSuggestion = useCallback((
    returnPage: 'menu' | 'explore' = 'menu',
    trigger: HTMLButtonElement | null = null,
  ): void => {
    const location = state.location.status === 'tracking' && state.location.latestFix &&
      isValidLocationCoordinates(state.location.latestFix.longitude, state.location.latestFix.latitude)
      ? state.location.latestFix
      : null
    setCommunitySubmissionWaypoint(null)
    setCommunitySubmissionCoordinate(location
      ? { longitude: location.longitude, latitude: location.latitude }
      : DEFAULT_PERSONAL_WAYPOINT_COORDINATE)
    setCommunitySubmissionLocationStatus(location ? 'ready' : session ? 'locating' : 'required')
    setCommunitySubmissionLocationAccuracy(location?.accuracy ?? null)
    setCommunitySubmissionReturnPage(returnPage)
    setIsCommunitySubmissionPending(false)
    communitySubmissionReturnFocusRef.current = returnPage === 'explore' ? trigger : null
    setMoreSheetDetent('full')
    setMorePage('community-submission')
    if (!location && session) {
      const needsLocationRestart = state.location.status === 'stale' ||
        state.location.status === 'denied' ||
        state.location.status === 'unavailable' ||
        state.location.status === 'timeout' ||
        state.location.status === 'invalid'
      if (needsLocationRestart) commands.locateUser()
      else commands.enableLocationTracking()
    }
  }, [commands, session, state.location])
  const beginCommunityCorrection = useCallback((waypointId: string, trigger: HTMLButtonElement): void => {
    const waypoint = communityWaypoints.find(({ id }) => id === waypointId)
    if (!waypoint) return
    setCommunitySubmissionWaypoint(waypoint)
    setCommunitySubmissionCoordinate(waypoint.coordinate)
    setCommunitySubmissionLocationStatus('ready')
    setCommunitySubmissionLocationAccuracy(null)
    setCommunitySubmissionReturnPage('explore')
    setIsCommunitySubmissionPending(false)
    communitySubmissionReturnFocusRef.current = trigger
    setMoreSheetDetent('full')
    setMorePage('community-submission')
  }, [communityWaypoints])
  const communityContent = (
    <CommunityWaypointPanel
      discovery={communityDiscovery}
      onSuggestCorrection={beginCommunityCorrection}
      onSuggestWaypoint={(trigger) => beginCommunityWaypointSuggestion('explore', trigger)}
    />
  )
  const navigateToPersonalWaypoint = useCallback((waypoint: PersonalWaypoint): void => {
    const endpoint = createPersonalWaypointTripEndpoint(waypoint)
    if (!endpoint) return

    skipMoreFocusRestoreRef.current = true
    appNavigation.navigateToEndpoint(endpoint)
    setPersonalWaypointDetails(null)
    setMorePage('closed')
    setMoreSheetDetent('partial')
  }, [appNavigation])
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
    waypointPlacementActive,
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
  // The More sheet is not one of the measured tabs, so waypoint details describe the screen they
  // cover themselves. Details sit at 60% of the screen on mobile, tab pill included.
  const getWaypointDetailsOcclusion = useCallback((): MapViewportInsets | undefined => {
    if (!isMobileViewport || !mobileSheetMetrics) return undefined
    const occupied = getMobileSheetOccupiedHeight('partial', createMobileSheetSnapPoints(
      mobileSheetMetrics.viewportHeight,
      mobileSheetMetrics.tabBarInset,
      mobileSheetMetrics.collapsedHeight,
      WAYPOINT_DETAILS_PARTIAL_EXTENT,
    ))
    return { top: 0, right: 0, bottom: occupied + MAP_OVERLAY_MARGIN, left: 0 }
  }, [isMobileViewport, mobileSheetMetrics])
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
    rememberedStopId: stopsPanelState.focusedStopId,
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

  // Closing waypoint details must also focus Plan when it was already active.
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
  }, [activeView, isMoreOpen])

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

  const navigationSessionCallbacksRef = useRef({
    handleStopSelected: appNavigation.handleStopSelected,
    openStopDetailsFromMap: appNavigation.openStopDetailsFromMap,
    handleMapStopInteraction: appNavigation.handleMapStopInteraction,
    openPlan: appNavigation.openPlan,
    handleMapJourneyOptionSelected,
  })
  useLayoutEffect(() => {
    navigationSessionCallbacksRef.current = {
      handleStopSelected: appNavigation.handleStopSelected,
      openStopDetailsFromMap: appNavigation.openStopDetailsFromMap,
      handleMapStopInteraction: appNavigation.handleMapStopInteraction,
      openPlan: appNavigation.openPlan,
      handleMapJourneyOptionSelected,
    }
  }, [
    appNavigation.handleMapStopInteraction,
    appNavigation.handleStopSelected,
    appNavigation.openPlan,
    appNavigation.openStopDetailsFromMap,
    handleMapJourneyOptionSelected,
  ])

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
      onStopSelected: (stopId) => navigationSessionCallbacksRef.current.handleStopSelected(stopId),
      onStopDetailsSelected: (stopId) => navigationSessionCallbacksRef.current.openStopDetailsFromMap(stopId),
      onMapStopInteraction: (stopId) => navigationSessionCallbacksRef.current.handleMapStopInteraction(stopId),
      onMapStopDestinationSet: () => navigationSessionCallbacksRef.current.openPlan(),
      onMapJourneyOptionSelected: (candidateKey) => navigationSessionCallbacksRef.current.handleMapJourneyOptionSelected(candidateKey),
      onMapCenterChange: ([longitude, latitude]) => setMapCenter({ longitude, latitude }),
      onMapMovingChange: setIsMapMoving,
    })
    setSession(mount.session)

    return () => {
      mount.dispose()
    }
  }, [
    services,
  ])

  const transitIndex = state.transitIndex
  const selectedRouteColor = state.selectedRouteColor ?? 'var(--bus-stop-default-color)'
  // Favourite stops are shown in the trip search before anything is typed.
  const planSearchSuggestions = useMemo(() => {
    if (!transitIndex) return []
    return stopsPanelState.favoriteStops.flatMap(({ id: stopId }) => {
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
  }, [transitIndex, stopsPanelState.favoriteStops])
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
    routeStopFocusRequest: appNavigation.routeStopFocusRequest,
    onRouteStopFocusHandled: appNavigation.clearRouteStopFocusRequest,
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
    community: {
      active: communityExploreActive,
      selectedWaypointLabel: communityDiscovery.selectedWaypoint?.displayLabel ?? null,
      content: communityContent,
      onModeChange: setCommunityExploreActive,
      onOpen: communityDiscovery.showCategoryPanel,
    },
  }
  // Mode is captured when the stop opens from Explore, so the label matches where Back returns.
  const stopBackLabel = appNavigation.stopReturnTarget !== 'explore'
    ? 'Back to stops'
    : appNavigation.stopReturnMode === 'bus-routes'
      ? 'Back to bus routes'
      : 'Back to Find venue'
  const dispatchAppNavigation = appNavigation.dispatch
  const selectRouteFromStops = appNavigation.selectRouteFromStops
  const handleRouteSelectionFromStops = useCallback(
    (routeId: string, stopId: string): void => {
      setCommunityExploreActive(false)
      selectRouteFromStops(routeId, stopId)
    },
    [selectRouteFromStops],
  )
  const handleStopsDetentChange = useCallback((detent: MobileSheetDetent): void => {
    if (detent !== 'collapsed' && isFocusInsideLocationControl(locationControlRef.current)) {
      focusTripControlAfterOverlayRef.current = true
    }
    dispatchAppNavigation({
      type: 'set-sheet-detent',
      view: 'stops',
      detent,
      source: 'manual',
    })
  }, [dispatchAppNavigation])
  const stopsWorkspaceContent = (
    <StopsWorkspace
      ref={stopsWorkspaceRef}
      minuteFormat={minuteFormat}
      transitIndex={state.transitIndex}
      mapCenter={mapCenter}
      location={state.location}
      active={navigationState.state.activeView === 'stops'}
      panelActive={!isMoreOpen && !waypointPlacementActive && navigation.activeView === 'stops'}
      isMobileViewport={isMobileViewport}
      detent={navigation.sheets.stops.detent}
      portalContainer={sheetPortalContainer}
      shellRef={stopsSheetRef}
      onDetentChange={handleStopsDetentChange}
      loadArrivals={loadStopsArrivals}
      loadPublicArrivals={loadPublicBusArrivals}
      loadServiceWindows={loadStopsServiceWindows}
      requestLocation={session ? requestNearbyLocation : null}
      locateFromControl={commands.locateUser}
      enableLocationTracking={commands.enableLocationTracking}
      onStateChange={publishStopsPanelState}
      onNearbyHighlightChange={publishNearbyHighlight}
      backLabel={stopBackLabel}
      onBackToStops={appNavigation.backFromStopDetails}
      onSelectOppositeStop={appNavigation.handleStopSelected}
      onSelectRoute={handleRouteSelectionFromStops}
      onNavigateToStop={appNavigation.navigateToStop}
    />
  )
  const selectView = (view: AppViewsProps['navigation']['activeView']): void => {
    if (isCommunitySubmissionPending) return
    if (isMoreOpen) {
      skipMoreFocusRestoreRef.current = true
      setMorePage('closed')
    }
    appNavigation.selectView(view, stopsPanelState.selectedStopList)
  }
  const openWaypoints = (): void => {
    personalWaypoints.refresh()
    setHasPersonalWaypointSearchFilter(false)
    setMoreSheetDetent('full')
    setMorePage('waypoints')
  }
  const openSettings = (): void => {
    setSelectedSettingsSection(null)
    setMoreSheetDetent('full')
    setMorePage('settings')
  }
  const openReleaseNotes = (): void => {
    setMoreSheetDetent('full')
    setMorePage('release-notes')
  }
  const beginWaypointCreation = (): void => {
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
    if (!returnPage) return
    setPlacementReturnPage(null)
    setMoreSheetDetent('full')
    setMorePage(returnPage ?? 'waypoints')
  }
  const clearPersonalWaypoints = (): void => {
    // Clearing removes every place, so any pending edit refers to records that no longer exist.
    // End the transaction first rather than leaving a staged list of deleted places on screen.
    personalWaypointEdits.cancel()
    setPersonalWaypointsEditing(false)
    setPersonalWaypointEditMessage(null)
    personalWaypoints.clearAll()
    setHasPersonalWaypointSearchFilter(false)
  }
  const removePersonalWaypoint = (waypointId: string): boolean => {
    return personalWaypoints.removeWaypoint(waypointId)
  }
  // Editing is a transaction: these three own the pending list, and only Confirm writes it.
  const beginPersonalWaypointEdits = (): void => {
    const blocked = personalWaypointEdits.begin()
    if (blocked) {
      personalWaypoints.refresh()
      return
    }
    setPersonalWaypointEditMessage(null)
    setPersonalWaypointsEditing(true)
  }
  const confirmPersonalWaypointEdits = (): void => {
    // Category names changed with them, so visibility preferences have to follow in the same
    // gesture. They are the one thing the session cannot write: it owns places, not preferences.
    const renames = personalWaypointEdits.renames
    const outcome = personalWaypointEdits.commit()
    if (outcome.kind === 'failed') return
    personalWaypointCategoryVisibility.applyCategoryRenames(renames)
    // The write went straight to the store, which this screen does not render from: the list shows
    // `personalWaypoints.readResult`. Without re-reading it, the list falls back to the pre-edit
    // snapshot and a removed place reappears while the map keeps its marker until the page is left
    // and reopened.
    personalWaypoints.refresh()
    setPersonalWaypointEditMessage(outcome.kind === 'saved' ? `List changes saved.` : null)
    setPersonalWaypointEditRevision((revision) => revision + 1)
    setPersonalWaypointsEditing(false)
    personalWaypointsInitialFocusRef.current?.focus()
  }
  const cancelPersonalWaypointEdits = (): void => {
    if (personalWaypointEdits.dirty) {
      setPendingEditDiscard(true)
      return
    }
    personalWaypointEdits.cancel()
    setPersonalWaypointEditMessage(null)
    setPersonalWaypointsEditing(false)
  }
  const deleteSelectedPersonalWaypoint = (): void => {
    if (!selectedPersonalWaypointId) return
    const waypoint = personalWaypoints.readResult.kind === 'ready'
      ? personalWaypoints.readResult.waypoints.find(({ id }) => id === selectedPersonalWaypointId)
      : undefined
    if (!waypoint || !window.confirm(`Delete "${waypoint.name}"? This cannot be undone.`)) return
    const returnTarget = personalWaypointDetails?.returnTarget
    if (!removePersonalWaypoint(selectedPersonalWaypointId)) return
    const focusTarget = returnTarget?.page === 'waypoints'
      ? personalWaypointsInitialFocusRef.current
      : returnTarget?.page === 'closed'
        ? moreEntryButtonRef.current
        : moreInitialFocusRef.current
    returnFromWaypointDetails(focusTarget)
  }
  const goBackInMore = useCallback((): void => {
    if (morePage === 'community-placing') {
      pendingWaypointReturnFocusRef.current = communitySubmissionPlacementFocusRef.current
      setMorePage('community-submission')
      setMoreSheetDetent('full')
      return
    }
    if (morePage === 'community-submission') {
      if (isCommunitySubmissionPending) return
      if (communitySubmissionReturnPage === 'explore') {
        pendingWaypointReturnFocusRef.current = communitySubmissionReturnFocusRef.current
        communitySubmissionReturnFocusRef.current = null
        setMorePage('closed')
        setMoreSheetDetent('partial')
      } else {
        setMorePage('menu')
        setMoreSheetDetent('partial')
      }
      return
    }
    if (morePage === 'placing') {
      const returnPage = placementReturnPage
      setPlacementReturnPage(null)
      setMorePage(returnPage ?? 'waypoints')
      setMoreSheetDetent('full')
      return
    }
    if (morePage === 'waypoint-details') {
      returnFromWaypointDetails()
      return
    }
    if ((morePage === 'creating' || morePage === 'editing-waypoint') && personalWaypoints.isDraftDirty) {
      // Leaving a changed draft asks first, whatever triggered the leave.
      setPendingDraftLeave('back')
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
    if (morePage === 'settings' && selectedSettingsSection !== null) {
      setSelectedSettingsSection(null)
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
  }, [
    cancelPersonalWaypointEdit,
    morePage,
    personalWaypointEditReturnPage,
    placementReturnPage,
    personalWaypoints.isDraftDirty,
    returnFromWaypointDetails,
    communitySubmissionReturnPage,
    isCommunitySubmissionPending,
    selectedSettingsSection,
  ])
  const closeMore = goBackInMore
  const toggleMore = (): void => {
    if (morePage === 'community-submission') {
      if (isCommunitySubmissionPending) return
      if (communitySubmissionReturnPage === 'explore') {
        pendingWaypointReturnFocusRef.current = communitySubmissionReturnFocusRef.current
        communitySubmissionReturnFocusRef.current = null
      }
      setMorePage('closed')
      setMoreSheetDetent('partial')
      return
    }
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
  }

  const selectedPersonalWaypoint = personalWaypoints.readResult.kind === 'ready'
    ? personalWaypoints.readResult.waypoints.find(({ id }) => id === selectedPersonalWaypointId) ?? null
    : null
  const canManageSelectedPersonalWaypoint = personalWaypoints.readResult.kind === 'ready' &&
    personalWaypoints.readResult.rejectedRecords.count === 0 &&
    selectedPersonalWaypoint !== null
  // Focusing the waypoint is a one-time move per place: opening details centres it once and
  // switching places centres the new one, while later pans, edits and re-renders leave the camera
  // alone. The return snapshot stays the one captured when details first opened.
  const focusedDetailsWaypointRef = useRef<string | null>(null)
  useEffect(() => {
    if (!personalWaypointDetails || morePage !== 'waypoint-details') {
      if (!personalWaypointDetails) focusedDetailsWaypointRef.current = null
      return
    }
    if (focusedDetailsWaypointRef.current === personalWaypointDetails.waypointId) return
    // Wait for the measured mobile sheet, so the focus accounts for the details sheet it opens
    // behind rather than the shared viewport insets.
    if (isMobileViewport && !mobileSheetMetrics) return
    const waypoint = selectedPersonalWaypoint?.id === personalWaypointDetails.waypointId
      ? selectedPersonalWaypoint
      : undefined
    if (!waypoint) return
    focusedDetailsWaypointRef.current = personalWaypointDetails.waypointId
    commands.focusPersonalWaypoint(waypoint, getWaypointDetailsOcclusion())
  }, [
    commands,
    getWaypointDetailsOcclusion,
    isMobileViewport,
    mobileSheetMetrics,
    morePage,
    personalWaypointDetails,
    selectedPersonalWaypoint,
  ])
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
  // Edit list starts a transaction; finishing it is the command bar's job, so the menu offers only
  // the way in. Clear all stays available, because removing it while editing would take a command
  // away rather than move one.
  const personalWaypointHeaderAction = morePage === 'waypoints' && canEditPersonalWaypoints
    ? <PersonalWaypointListActions
      editing={personalWaypointsEditing}
      hasSearchFilter={hasPersonalWaypointSearchFilter}
      onToggleEditing={beginPersonalWaypointEdits}
      onClearAll={clearPersonalWaypoints}
    />
    : undefined

  useLayoutEffect(() => {
    const pendingReturnFocus = pendingWaypointReturnFocusRef.current
    const pendingReturnLabel = pendingWaypointReturnFocusLabelRef.current
    if (pendingReturnFocus || pendingReturnLabel) {
      pendingWaypointReturnFocusRef.current = null
      pendingWaypointReturnFocusLabelRef.current = null
      // Removing a waypoint can detach its row; the same label finds the row in the restored list,
      // which is otherwise rebuilt when the details page closes.
      const reopenedRow = pendingReturnLabel === null
        ? null
        : Array.from(document.querySelectorAll<HTMLElement>('[aria-label]')).find((element) => (
          element.getAttribute('aria-label') === pendingReturnLabel
        )) ?? null
      if (pendingReturnFocus?.isConnected) pendingReturnFocus.focus()
      else if (reopenedRow?.isConnected) reopenedRow.focus()
      else if (isMoreOpen && morePage === 'waypoints') personalWaypointsInitialFocusRef.current?.focus()
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
  }, [isMobileViewport, isMoreOpen, morePage])

  useEffect(() => {
    if (morePage === 'closed') return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (event.target instanceof Element && event.target.closest('[data-keyboard-reordering="true"], [role="listbox"], [data-menu-open="true"], [data-owns-escape="true"]')) return
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
      data-waypoint-placing={waypointPlacementActive ? 'true' : 'false'}
      style={{ '--desktop-navigation-width': `${navigationColumnWidth}px` } as CSSProperties}
    >
      <p className="visually-hidden" role="alert" aria-label="Personal waypoint status" aria-atomic="true">
        {personalWaypoints.statusKind === 'problem' ? personalWaypoints.status : ''}
      </p>
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
        {morePage === 'community-placing' && <PersonalWaypointPlacement
          coordinate={communitySubmissionCoordinate}
          showCurrentLocationAction
          onUseMapCentre={mapCenter && !isMapMoving
            ? () => {
              setCommunitySubmissionCoordinate(mapCenter)
              setCommunitySubmissionLocationStatus('ready')
              setCommunitySubmissionLocationAccuracy(null)
            }
            : undefined}
          onUseCurrentLocation={currentLocationFix
            ? () => {
              setCommunitySubmissionCoordinate({
                latitude: currentLocationFix.latitude,
                longitude: currentLocationFix.longitude,
              })
              setCommunitySubmissionLocationStatus('ready')
              setCommunitySubmissionLocationAccuracy(currentLocationFix.accuracy)
            }
            : undefined}
          onApplyCoordinate={applyTypedCommunityWaypointCoordinate}
          onContinue={() => {
            pendingWaypointReturnFocusRef.current = communitySubmissionPlacementFocusRef.current
            setMorePage('community-submission')
          }}
          onCancel={() => {
            pendingWaypointReturnFocusRef.current = communitySubmissionPlacementFocusRef.current
            setMorePage('community-submission')
          }}
        />}
        {isCrosshairVisible && (
          <NearbyCrosshair insets={mapInsets} />
        )}
        <RainroomAtmosphere />
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
                  navigation.activeView === 'plan' && navigation.sheets.plan.detent === 'full'
                )}
                onRootChange={(root) => {
                  locationControlRef.current = root
                }}
                searching={state.location.status === 'requesting'}
                onLocate={commands.locateUser}
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
            <div><span className="legend-marker community-waypoint-legend-marker" /> Community Waypoints</div>
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
          waypointPlacementActive={waypointPlacementActive}
          sheetPortalContainer={sheetPortalContainer}
          navigation={navigation}
          onSelectView={selectView}
          morePanel={{
            open: isMoreOpen,
            page: morePage,
            detent: moreSheetDetent,
            // A confirmed edit is announced from here, because the write is the edit session's, not
            // the per-waypoint workflow's.
            statusMessage: personalWaypointEditMessage
              ?? (personalWaypoints.statusKind === 'success' ? personalWaypoints.status : null),
            statusRevision: personalWaypointEditMessage ? personalWaypointEditRevision : personalWaypoints.statusRevision,
            headerAction: personalWaypointHeaderAction,
            title: morePage === 'waypoints'
              ? 'My waypoints'
              : morePage === 'waypoint-details' ? 'Waypoint details'
              : morePage === 'creating' ? 'Add waypoint'
                : morePage === 'placing' ? 'Adjust location'
                  : morePage === 'community-submission'
                    ? communitySubmissionWaypoint ? 'Suggest a correction' : 'Suggest a waypoint'
                    : morePage === 'community-placing' ? 'Adjust location'
                  : morePage === 'editing-waypoint' ? 'Edit waypoint'
                    : morePage === 'settings'
                      ? selectedSettingsSection === null ? 'Settings' : getSettingsSectionTitle(selectedSettingsSection)
                      : morePage === 'release-notes' ? 'Release notes' : 'More',
            backButtonLabel: morePage === 'settings' && selectedSettingsSection !== null
              ? 'Back to Settings'
              : 'Back to previous view',
            scrollResetKey: morePage === 'settings'
              ? selectedSettingsSection ?? 'home'
              : morePage,
            initialFocusRef: moreInitialFocusRef,
            onClose: closeMore,
            onDetentChange: setMoreSheetDetent,
            content: morePage === 'menu' ? <MoreMenu installSection={<PwaInstallSection />}
              waypointCount={personalWaypoints.readResult.kind === 'ready'
                ? personalWaypoints.readResult.waypoints.length
                : null}
              onOpenWaypoints={openWaypoints}
              onSuggestCommunityWaypoint={() => beginCommunityWaypointSuggestion()}
              onOpenSettings={openSettings}
              onOpenReleaseNotes={openReleaseNotes}
            /> : morePage === 'waypoints' ? <PersonalWaypointsHome
              // While a pending edit exists the list renders those places, so what is on screen is
              // always exactly what Confirm would write.
              readResult={personalWaypointEdits.working === null
                ? personalWaypoints.readResult
                : personalWaypoints.readResult.kind === 'ready'
                  ? { ...personalWaypoints.readResult, waypoints: personalWaypointEdits.working }
                  : personalWaypoints.readResult}
              status={personalWaypointEdits.issue
                ?? (personalWaypoints.statusKind === 'problem' ? personalWaypoints.status : null)}
              onAdd={beginWaypointCreation}
              // A rename is staged like a move or a removal: the list only offers it in Edit list,
              // and only Confirm writes the result.
              onRenameCategory={personalWaypointEdits.rename}
              onMergeCategoryVisibility={personalWaypointCategoryVisibility.predictCategoryMergeVisibility}
              onOpenDetails={(waypoint, trigger) => openPersonalWaypointDetails(
                waypoint.id,
                'waypoints',
                moreSheetDetent,
                trigger,
              )}
              onSearchFilterChange={setHasPersonalWaypointSearchFilter}
              editing={personalWaypointsEditing}
              onRemove={personalWaypointEdits.remove}
              onMove={personalWaypointEdits.move}
              onReorder={personalWaypointEdits.reorder}
              editingCategories={personalWaypointEdits.categories}
              onConfirmEdits={confirmPersonalWaypointEdits}
              onCancelEdits={cancelPersonalWaypointEdits}
              onResetUnreadableData={personalWaypoints.resetUnreadableData}
              onDiscardRejectedRecords={personalWaypoints.discardRejectedRecords}
              categoryOptions={personalWaypointCategoryOptions}
              hiddenCategories={personalWaypointCategoryVisibility.hiddenCategories}
              draftHiddenCategories={personalWaypointCategoryVisibility.draftHiddenCategories}
              categoryPickerOpen={personalWaypointCategoryVisibility.pickerOpen}
              categoryVisibilityStatus={personalWaypointCategoryVisibility.status}
              onSetCategoryVisible={personalWaypointCategoryVisibility.setCategoryVisible}
              onToggleCategoryPicker={personalWaypointCategoryVisibility.togglePicker}
              onClearCategoryVisibilityChanges={personalWaypointCategoryVisibility.clearCategoryVisibilityChanges}
              onCancelCategoryVisibilityChanges={personalWaypointCategoryVisibility.cancelCategoryVisibilityChanges}
              onDoneCategoryVisibilityChanges={personalWaypointCategoryVisibility.saveCategoryVisibilityChanges}
              categoryPickerTriggerRef={personalWaypointCategoryPickerRef}
              initialFocusRef={personalWaypointsInitialFocusRef}
            /> : morePage === 'waypoint-details' ? <PersonalWaypointDetails
              waypoint={selectedPersonalWaypoint}
              canManage={canManageSelectedPersonalWaypoint}
              onDirections={() => {
                if (selectedPersonalWaypoint) navigateToPersonalWaypoint(selectedPersonalWaypoint)
              }}
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
              // Cancel leaves the form the same way the panel's Back does, so it goes through the
              // shared unsaved-draft confirmation instead of quietly discarding the draft.
              onCancel={() => {
                if (personalWaypoints.isDraftDirty) {
                  setPendingDraftLeave('cancel')
                  return
                }
                if (morePage === 'editing-waypoint') {
                  cancelPersonalWaypointEdit()
                  setMorePage(personalWaypointEditReturnPage)
                } else {
                  personalWaypoints.cancelEdit()
                  setMorePage('waypoints')
                }
              }}
              onSave={() => {
                if (personalWaypoints.save()) {
                  if (morePage === 'editing-waypoint') setMorePage(personalWaypointEditReturnPage)
                  else {
                    setMorePage('waypoints')
                  }
                }
              }}
            /> : morePage === 'community-submission' || morePage === 'community-placing' ? (
              <CommunityWaypointSubmissionForm
                waypoint={communitySubmissionWaypoint}
                coordinate={communitySubmissionCoordinate}
                locationStatus={communitySubmissionLocationStatus}
                locationAccuracy={communitySubmissionLocationAccuracy}
                buildingIndex={state.buildings}
                venues={state.venues}
                onAdjustLocation={(trigger) => {
                  communitySubmissionPlacementFocusRef.current = trigger
                  setMorePage('community-placing')
                }}
                onSubmit={services.submitCommunityWaypoint}
                onBack={goBackInMore}
                onPendingChange={setIsCommunitySubmissionPending}
              />
            ) : morePage === 'release-notes' ? <ReleaseNotes /> : morePage === 'settings' ? (
              <SettingsContent
                communityWaypointDownloadUrl={buildBasePathUrl('data/community-waypoints.geojson')}
                themePreference={themePreference}
                activeSection={selectedSettingsSection}
                onActiveSectionChange={setSelectedSettingsSection}
                onThemePreferenceChange={changeThemePreference}
                minuteFormat={minuteFormat}
                onMinuteFormatChange={changeMinuteFormat}
                favoriteStops={stopsPanelState.favoriteStops}
                onMoveFavorite={reorderFavorite}
                onRemoveFavorite={removeFavorite}
                onClearFavorites={clearFavoriteStops}
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
          }}
          views={{
            plan: planContentProps,
            explore: exploreContentProps,
            stops: stopsWorkspaceContent,
          }}
        />
        {/* One confirmation for leaving a changed waypoint draft, whichever control asked. */}
        <ConfirmDialog
          open={pendingDraftLeave !== null}
          title="Discard this draft?"
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          destructive
          onConfirm={() => {
            setPendingDraftLeave(null)
            if (morePage === 'editing-waypoint') {
              cancelPersonalWaypointEdit()
              setMorePage(personalWaypointEditReturnPage)
            } else if (morePage === 'creating') {
              personalWaypoints.cancelEdit()
              setMorePage('waypoints')
            }
            setMoreSheetDetent('full')
          }}
          onCancel={() => setPendingDraftLeave(null)}
        >
          <p>Your changes to this waypoint have not been saved.</p>
        </ConfirmDialog>
        {/* Cancelling an edit discards staged moves and removals, so it says what will be lost. */}
        <ConfirmDialog
          open={pendingEditDiscard}
          title="Discard these list changes?"
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          destructive
          onConfirm={() => {
            setPendingEditDiscard(false)
            personalWaypointEdits.cancel()
            setPersonalWaypointsEditing(false)
            personalWaypointsInitialFocusRef.current?.focus()
          }}
          onCancel={() => setPendingEditDiscard(false)}
        >
          <p>
            {personalWaypointEdits.changeSummary
              ? `${personalWaypointEdits.changeSummary}. Nothing has been saved yet.`
              : 'Nothing has been saved yet.'}
          </p>
        </ConfirmDialog>
      </MobileSheetMetricsContext.Provider>
    </main>
  )
}

export default App
