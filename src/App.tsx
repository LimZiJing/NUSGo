import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { ContextualPanel } from './components/ContextualPanel'
import { MapControls } from './components/MapControls'
import { isFocusInsideMapControls } from './components/map-controls-focus'
import { TripEndpointControls } from './components/TripEndpointControl'
import { createNavigationSession, type NavigationSession } from './app/navigation-session'
import {
  createNavigationSessionCommandAdapter,
  createNavigationSessionMount,
} from './app/navigation-session-mount'
import { useNavigationSession } from './app/use-navigation-session'
import {
  createInitialMobileOverlayState,
  getIsMobileViewport,
  mobileOverlayReducer,
  subscribeToMobileViewport,
} from './app/mobile-overlay-state'
import type { MapViewportInsets } from './app/map-camera'
import { applyMapOverlayMeasurements } from './app/map-insets-controller'
import { loadTransitMapData, loadVenueData } from './infrastructure/data/loaders'
import { createMapSession } from './infrastructure/map/session'
import './App.css'

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapControlsRef = useRef<HTMLDivElement>(null)
  const tripControlsRef = useRef<HTMLElement>(null)
  const contextualPanelRef = useRef<HTMLElement>(null)
  const [session, setSession] = useState<NavigationSession | null>(null)
  const state = useNavigationSession(session)
  const [mobileOverlay, dispatchMobileOverlay] = useReducer(
    mobileOverlayReducer,
    undefined,
    createInitialMobileOverlayState,
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
      dispatchMobileOverlay({ type: 'viewport-changed', isMobile })
    }
    updateViewport()
    return subscribeToMobileViewport(updateViewport)
  }, [])

  useEffect(() => {
    const previous = previousContextualStateRef.current
    previousContextualStateRef.current = state.contextualPanel
    if (!previous) return
    const changed = previous.mode !== state.contextualPanel.mode ||
      previous.query !== state.contextualPanel.query ||
      previous.selectedVenue?.code !== state.contextualPanel.selectedVenue?.code ||
      previous.history.length !== state.contextualPanel.history.length
    if (changed) dispatchMobileOverlay({ type: 'contextual-state-changed' })
  }, [state.contextualPanel])

  useLayoutEffect(() => {
    const updateInsets = (): void => {
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      const viewportHeight = window.innerHeight
      const nextInsets = applyMapOverlayMeasurements(commands, {
        viewportWidth,
        viewportHeight,
        tripCardHeight: tripControlsRef.current?.getBoundingClientRect().height ?? 0,
        contextualSheetHeight: contextualPanelRef.current?.getBoundingClientRect().height ?? 0,
        tripCardVisible: isMobileViewport,
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

    return () => {
      window.removeEventListener('resize', updateInsets)
      resizeObserver?.disconnect()
    }
  }, [
    commands,
    isMobileViewport,
    mobileOverlay.contextualPanelMinimized,
    mobileOverlay.tripExpanded,
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
  }, [isMobileViewport, mobileOverlay.tripExpanded])

  useEffect(() => {
    if (!mapContainer.current) return

    const mount = createNavigationSessionMount(mapContainer.current, {
      createMapSession,
      createNavigationSession,
      loadVenues: loadVenueData,
      loadTransit: loadTransitMapData,
      onMapInteraction: () => setMapControlsOpen(false),
    })
    setSession(mount.session)

    return () => {
      mount.dispose()
    }
  }, [])

  const selectedRouteColor = state.selectedRouteColor ?? '#334155'

  return (
    <main className="map-shell">
      <div className="map-stage">
        <div
          ref={mapContainer}
          className="map"
          style={{ '--map-overlay-bottom-inset': `${mapInsets.bottom}px` } as CSSProperties}
        />
        <MapControls
          visible={isMobileViewport && !mobileOverlay.tripExpanded}
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
          containerRef={tripControlsRef}
          expanded={isMobileViewport && mobileOverlay.tripExpanded}
          mobileViewport={isMobileViewport}
          onExpandedChange={(expanded) => {
            if (expanded && isFocusInsideMapControls(mapControlsRef.current)) {
              focusTripControlAfterOverlayRef.current = true
            }
            setMapControlsOpen(false)
            dispatchMobileOverlay({
              type: 'set-trip-expanded',
              expanded,
            })
          }}
        />
        <ContextualPanel
          state={state.contextualPanel}
          venues={state.venues}
          network={state.transitIndex?.network ?? null}
          networkIndex={state.transitIndex}
          selectedRouteId={state.selectedRouteId}
          minimized={isMobileViewport && mobileOverlay.contextualPanelMinimized}
          mobileViewport={isMobileViewport}
          onRestore={() => dispatchMobileOverlay({ type: 'restore-contextual-panel' })}
          containerRef={contextualPanelRef}
          resourceStatus={state.resourceStatus}
          mapError={state.mapError}
          startupFailure={state.startupFailure}
          onQueryChange={commands.setContextualPanelQuery}
          onVenueSelect={commands.selectVenue}
          onOpenVenueSearch={commands.openVenueSearch}
          onOpenShuttle={commands.openShuttle}
          onBack={commands.back}
          onClose={commands.close}
          onEscape={commands.escape}
          onRouteSelect={commands.selectRoute}
        />
      </div>
    </main>
  )
}

export default App
