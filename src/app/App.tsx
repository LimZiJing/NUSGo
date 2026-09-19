import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from 'react'
import { validateTripRequest } from '../domain/trip/endpoints'
import type { TripEndpoint, TripEndpointRole } from '../domain/trip/types'
import { ContextualPanel } from '../features/contextual-panel/ContextualPanel'
import { TripEndpointControl } from '../features/trip-endpoints/TripEndpointControl'
import {
  contextualPanelReducer,
  createInitialContextualPanelState,
} from '../features/contextual-panel/state'
import { loadTransitMapData, loadVenueData } from '../infrastructure/data/loaders'
import { createMapSession } from '../infrastructure/map/session'
import {
  createNavigationSession,
  type NavigationSession,
} from './navigation-session'
import { useNavigationSession } from './use-navigation-session'
import type { VenueSearchResult } from '../domain/venue/search'

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const contextualPanelStateRef = useRef(createInitialContextualPanelState())
  const [navigationSession, setNavigationSession] = useState<NavigationSession | null>(null)
  const navigationSessionRef = useRef<NavigationSession | null>(null)
  const [originSearchQuery, setOriginSearchQuery] = useState('')
  const [destinationSearchQuery, setDestinationSearchQuery] = useState('')
  const [contextualPanelState, dispatchContextualPanel] = useReducer(
    contextualPanelReducer,
    undefined,
    createInitialContextualPanelState,
  )
  const navigationState = useNavigationSession(navigationSession)
  const {
    venues,
    transitNetwork,
    transitNetworkIndex,
    selectedVenue,
    selectedRouteId,
    selectedRouteColor,
    tripRequest,
    status,
  } = navigationState
  const tripValidation = validateTripRequest(tripRequest)

  useEffect(() => {
    contextualPanelStateRef.current = contextualPanelState
  }, [contextualPanelState])

  const handleRouteSelect = useCallback((routeId: string | null) => {
    navigationSession?.selectRoute(routeId)
  }, [navigationSession])

  const handleSetTripEndpoint = useCallback((role: TripEndpointRole, endpoint: TripEndpoint) => {
    navigationSession?.setTripEndpoint(role, endpoint)
    if (role === 'origin') {
      setOriginSearchQuery('')
    } else {
      setDestinationSearchQuery('')
    }
  }, [navigationSession])

  const handleClearTripEndpoint = useCallback((role: TripEndpointRole) => {
    navigationSession?.clearTripEndpoint(role)
  }, [navigationSession])

  const handleSwapTripEndpoints = useCallback(() => {
    navigationSession?.swapTripEndpoints()
  }, [navigationSession])

  const handleClearTrip = useCallback(() => {
    navigationSession?.clearTrip()
    setOriginSearchQuery('')
    setDestinationSearchQuery('')
  }, [navigationSession])

  const clearSelectedVenueMarker = useCallback(() => {
    // Venue details live in the contextual panel; the map only keeps the selected marker.
    navigationSessionRef.current?.clearVenue()
  }, [])

  const handleVenueSelect = useCallback((result: VenueSearchResult) => {
    dispatchContextualPanel({ type: 'select-venue', result })
    navigationSession?.selectVenue(result)
  }, [navigationSession])

  const handlePanelClose = useCallback(() => {
    clearSelectedVenueMarker()
    dispatchContextualPanel({ type: 'close' })
  }, [clearSelectedVenueMarker])

  const handlePanelEscape = useCallback(() => {
    const currentState = contextualPanelStateRef.current
    const previousState = currentState.history.at(-1)
    if (
      !previousState ||
      (currentState.mode === 'venue-detail' && previousState.mode !== 'venue-detail')
    ) {
      clearSelectedVenueMarker()
    }
    dispatchContextualPanel({ type: 'escape' })
  }, [clearSelectedVenueMarker])

  const handlePanelBack = useCallback(() => {
    const currentState = contextualPanelStateRef.current
    const previousState = currentState.history.at(-1)
    if (
      currentState.mode === 'venue-detail' &&
      previousState?.mode !== 'venue-detail'
    ) {
      clearSelectedVenueMarker()
    }
    dispatchContextualPanel({ type: 'back' })
  }, [clearSelectedVenueMarker])

  const handlePanelMapClick = useCallback(() => {
    if (contextualPanelStateRef.current.mode !== 'venue-detail') return

    clearSelectedVenueMarker()
    dispatchContextualPanel({ type: 'map-click' })
  }, [clearSelectedVenueMarker])

  useEffect(() => {
    if (!mapContainer.current) return

    const controller = new AbortController()
    let session: NavigationSession | null = null
    const mapSession = createMapSession({
      container: mapContainer.current,
      onMapError: (error) => session?.reportMapError(error),
      onEmptyMapClick: handlePanelMapClick,
    })
    session = createNavigationSession({
      map: mapSession,
      loadVenues: loadVenueData,
      loadTransit: loadTransitMapData,
    })
    navigationSessionRef.current = session
    setNavigationSession(session)
    void session.start(controller.signal)

    return () => {
      controller.abort()
      if (navigationSessionRef.current === session) navigationSessionRef.current = null
      session?.dispose()
      setNavigationSession(null)
    }
  }, [handlePanelMapClick])

  const stops = transitNetwork?.stops ?? []

  return (
    <main className="map-shell">
      <div ref={mapContainer} className="map" />
      <div className="map-overlay-right">
        <section className="trip-controls" aria-label="Trip endpoints">
          <div className="trip-controls-heading">
            <h2>Trip endpoints</h2>
            <button
              type="button"
              onClick={handleSwapTripEndpoints}
              disabled={!tripRequest.origin || !tripRequest.destination}
              aria-label="Swap origin and destination"
            >
              Swap
            </button>
          </div>
          <TripEndpointControl
            role="origin"
            endpoint={tripRequest.origin}
            venues={venues}
            stops={stops}
            searchQuery={originSearchQuery}
            onSearchQueryChange={setOriginSearchQuery}
            onSelect={(endpoint) => handleSetTripEndpoint('origin', endpoint)}
            onClear={() => handleClearTripEndpoint('origin')}
          />
          <TripEndpointControl
            role="destination"
            endpoint={tripRequest.destination}
            venues={venues}
            stops={stops}
            searchQuery={destinationSearchQuery}
            onSearchQueryChange={setDestinationSearchQuery}
            onSelect={(endpoint) => handleSetTripEndpoint('destination', endpoint)}
            onClear={() => handleClearTripEndpoint('destination')}
          />
          <button
            type="button"
            className="trip-clear-both"
            onClick={handleClearTrip}
            disabled={!tripRequest.origin && !tripRequest.destination}
          >
            Clear both endpoints
          </button>
          <p className="trip-validation" role="status" aria-live="polite" aria-atomic="true">
            {tripValidation ?? 'Origin and destination are set.'}
          </p>
        </section>
        <ContextualPanel
          state={navigationSession ? { ...contextualPanelState, selectedVenue } : contextualPanelState}
          venues={venues}
          network={transitNetwork}
          networkIndex={transitNetworkIndex}
          selectedRouteId={selectedRouteId}
          onQueryChange={(query) => dispatchContextualPanel({ type: 'set-query', query })}
          onVenueSelect={handleVenueSelect}
          onOpenVenueSearch={() => dispatchContextualPanel({ type: 'open-venue-search' })}
          onOpenShuttle={() => dispatchContextualPanel({ type: 'open-shuttle' })}
          onBack={handlePanelBack}
          onClose={handlePanelClose}
          onEscape={handlePanelEscape}
          onRouteSelect={handleRouteSelect}
        />
      </div>
      <aside
        className="map-legend"
        aria-label="Map legend"
        style={{ '--bus-stop-selected-color': selectedRouteColor ?? '#334155' } as CSSProperties}
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
      <div className="map-status" role="status">
        {status}
      </div>
    </main>
  )
}

export default App
