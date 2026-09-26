import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { ContextualPanel } from '../features/contextual-panel/contextual-panel'
import { MobileStopsSheet } from '../features/shuttle-browsing/mobile-stops-sheet'
import { MapControls } from '../ui/map-controls'
import { isFocusInsideMapControls } from '../ui/map-controls-focus'
import { MobileTabBar } from '../ui/mobile-tab-bar'
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
import { getValhallaBaseUrl } from './routing-config'
import { createJourneyPlanningService } from './journey-planning'
import { createShuttleArrivalClient } from '../infrastructure/shuttle-arrivals/client'
import { createShuttleServiceHoursClient } from '../infrastructure/shuttle-service-hours/client'

function App() {
  const mapShellRef = useRef<HTMLElement>(null)
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapControlsRef = useRef<HTMLDivElement>(null)
  const tripControlsRef = useRef<HTMLElement>(null)
  const contextualPanelRef = useRef<HTMLElement>(null)
  const stopsSheetRef = useRef<HTMLElement>(null)
  const mobileTabBarRef = useRef<HTMLElement>(null)
  const [session, setSession] = useState<NavigationSession | null>(null)
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
  const [mapControlsOpen, setMapControlsOpen] = useState(false)
  const [mapInsets, setMapInsets] = useState<MapViewportInsets>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })
  const previousContextualStateRef = useRef<typeof state.contextualPanel | null>(null)
  const focusTripControlAfterOverlayRef = useRef(false)
  const commandAdapter = useMemo(() => createNavigationSessionCommandAdapter(), [])
  const commands = commandAdapter(session)
  const shuttleArrivalClient = useMemo(() => createShuttleArrivalClient(), [])
  const shuttleServiceHoursClient = useMemo(() => createShuttleServiceHoursClient(), [])
  const journeyPlanner = useMemo(() => createJourneyPlanningService(
    createValhallaRouteEngine({
      baseUrl: getValhallaBaseUrl(import.meta.env.VITE_VALHALLA_BASE_URL, import.meta.env.DEV),
    }),
    shuttleArrivalClient,
    shuttleServiceHoursClient,
  ), [shuttleArrivalClient, shuttleServiceHoursClient])

  useEffect(() => {
    const updateViewport = (): void => {
      const isMobile = getIsMobileViewport()
      setIsMobileViewport(isMobile)
      if (!isMobile) {
        if (isFocusInsideMapControls(mapControlsRef.current)) {
          focusTripControlAfterOverlayRef.current = true
        }
        setMapControlsOpen(false)
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
      shell.style.setProperty(
        '--mobile-viewport-height',
        `${viewport?.height ?? window.innerHeight}px`,
      )
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
      shell.style.removeProperty('--mobile-viewport-offset-top')
    }
  }, [isMobileViewport])

  const activeTab = mobileNavigation.activeTab
  const activeSheetExpanded = mobileNavigation.sheets[activeTab].expanded
  const dismissMapPopup = commands.dismissMapPopup

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
    const changed = previous.mode !== state.contextualPanel.mode ||
      previous.query !== state.contextualPanel.query ||
      previous.selectedVenue?.code !== state.contextualPanel.selectedVenue?.code ||
      previous.history.length !== state.contextualPanel.history.length
    if (changed && isMobileViewport && mobileNavigation.activeTab === 'explore') {
      dispatchMobileNavigation({
        type: 'set-sheet-expanded',
        tab: 'explore',
        expanded: true,
      })
    }
  }, [isMobileViewport, mobileNavigation.activeTab, state.contextualPanel])

  useLayoutEffect(() => {
    const updateInsets = (): void => {
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      const viewportHeight = window.innerHeight
      const activeSheetHeight = mobileNavigation.activeTab === 'plan'
        ? tripControlsRef.current?.getBoundingClientRect().height ?? 0
        : mobileNavigation.activeTab === 'stops'
          ? stopsSheetRef.current?.getBoundingClientRect().height ?? 0
          : contextualPanelRef.current?.getBoundingClientRect().height ?? 0
      const tabBarHeight = mobileTabBarRef.current?.getBoundingClientRect().height ?? 0
      const nextInsets = applyMapOverlayMeasurements(commands, {
        viewportWidth,
        viewportHeight,
        tripCardHeight: 0,
        contextualSheetHeight: activeSheetHeight + tabBarHeight,
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
    }

    updateInsets()
    window.addEventListener('resize', updateInsets)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateInsets)
    if (tripControlsRef.current) resizeObserver?.observe(tripControlsRef.current)
    if (contextualPanelRef.current) resizeObserver?.observe(contextualPanelRef.current)
    if (stopsSheetRef.current) resizeObserver?.observe(stopsSheetRef.current)
    if (mobileTabBarRef.current) resizeObserver?.observe(mobileTabBarRef.current)

    return () => {
      window.removeEventListener('resize', updateInsets)
      resizeObserver?.disconnect()
    }
  }, [
    commands,
    isMobileViewport,
    mobileNavigation.activeTab,
    mobileNavigation.sheets.explore.expanded,
    mobileNavigation.sheets.plan.expanded,
    mobileNavigation.sheets.stops.expanded,
    state.contextualPanel.mode,
    state.contextualPanel.selectedVenue?.code,
    state.selectedRouteId,
  ])

  useLayoutEffect(() => {
    if (!focusTripControlAfterOverlayRef.current) return
    focusTripControlAfterOverlayRef.current = false
    const focusTarget = tripControlsRef.current?.querySelector<HTMLElement>(
      '.trip-controls-body input:not([disabled]), .trip-controls-body select:not([disabled]), .trip-controls-body textarea:not([disabled]), .trip-controls-toggle',
    )
    focusTarget?.focus()
  }, [isMobileViewport, mobileNavigation.sheets.plan.expanded])

  useEffect(() => {
    if (!mapContainer.current) return

    const mount = createNavigationSessionMount(mapContainer.current, {
      createMapSession,
      createNavigationSession,
      loadVenues: loadVenueData,
      loadTransit: loadTransitMapData,
      journeyPlanner,
      onMapInteraction: () => setMapControlsOpen(false),
    })
    setSession(mount.session)

    return () => {
      mount.dispose()
    }
  }, [journeyPlanner])

  const selectedRouteColor = state.selectedRouteColor ?? '#334155'

  return (
    <main className="map-shell" ref={mapShellRef}>
      <div className="map-stage">
        <div
          ref={mapContainer}
          className="map"
          style={{ '--map-overlay-bottom-inset': `${mapInsets.bottom}px` } as CSSProperties}
        />
        <MapControls
          visible={isMobileViewport && !(
            mobileNavigation.activeTab === 'plan' && mobileNavigation.sheets.plan.expanded
          )}
          topOffset={mapInsets.top || 76}
          onRootChange={(root) => {
            mapControlsRef.current = root
          }}
          open={mapControlsOpen}
          onOpenChange={setMapControlsOpen}
          onZoomIn={commands.zoomIn}
          onZoomOut={commands.zoomOut}
          onReset={commands.resetView}
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
            expanded={isMobileViewport ? mobileNavigation.sheets.plan.expanded : false}
            mobileViewport={isMobileViewport}
            onExpandedChange={(expanded) => {
              if (!isMobileViewport) return
              if (expanded && isFocusInsideMapControls(mapControlsRef.current)) {
                focusTripControlAfterOverlayRef.current = true
              }
              setMapControlsOpen(false)
              dispatchMobileNavigation(expanded
                ? { type: 'set-sheet-expanded', tab: 'plan', expanded: true }
                : { type: 'close-active-tab' })
            }}
          />
        </div>
        <div
          id="mobile-explore-panel"
          hidden={isMobileViewport && mobileNavigation.activeTab !== 'explore'}
        >
          <ContextualPanel
            state={state.contextualPanel}
            venues={state.venues}
            shuttleRoutesAvailable={(state.transitIndex?.routes.length ?? 0) > 0}
            renderShuttleRoutes={(selectRef) => (
              <ShuttleRouteControl
                network={state.transitIndex?.network ?? null}
                networkIndex={state.transitIndex}
                selectedRouteId={state.selectedRouteId}
                onRouteSelect={commands.selectRoute}
                selectRef={selectRef}
              />
            )}
            minimized={isMobileViewport && !mobileNavigation.sheets.explore.expanded}
            mobileViewport={isMobileViewport}
            active={!isMobileViewport || mobileNavigation.activeTab === 'explore'}
            onRestore={() => dispatchMobileNavigation({
              type: 'set-sheet-expanded',
              tab: 'explore',
              expanded: true,
            })}
            onMinimize={() => dispatchMobileNavigation({ type: 'close-active-tab' })}
            containerRef={contextualPanelRef}
            status={panelStatus}
            onQueryChange={commands.setContextualPanelQuery}
            onVenueSelect={commands.selectVenue}
            onOpenVenueSearch={commands.openVenueSearch}
            onOpenShuttle={commands.openShuttle}
            onBack={commands.back}
            onClose={() => {
              if (isMobileViewport) commands.closeToRoot()
              else commands.close()
            }}
            onEscape={commands.escape}
            onDismissMapPopup={isMobileViewport ? commands.dismissMapPopup : undefined}
          />
        </div>
        <div
          id="mobile-stops-panel"
          hidden={!isMobileViewport || mobileNavigation.activeTab !== 'stops'}
        >
          <MobileStopsSheet
            expanded={mobileNavigation.sheets.stops.expanded}
            onExpandedChange={(expanded) => dispatchMobileNavigation(expanded
              ? { type: 'set-sheet-expanded', tab: 'stops', expanded: true }
              : { type: 'close-active-tab' })}
            containerRef={stopsSheetRef}
          />
        </div>
      </div>
      <MobileTabBar
        activeTab={mobileNavigation.activeTab}
        onSelectTab={(tab) => {
          setMapControlsOpen(false)
          dispatchMobileNavigation({ type: 'select-tab', tab })
        }}
        containerRef={mobileTabBarRef}
      />
    </main>
  )
}

export default App
