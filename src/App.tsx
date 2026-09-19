import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from 'react'
import { ContextualPanel } from './components/ContextualPanel'
import { TripEndpointControl } from './components/TripEndpointControl'
import {
  createInitialResourceStatus,
  deriveResourceStatus,
  markTransitFailed,
  markTransitLoaded,
  markVenueFailed,
  markVenueLoaded,
} from './app/resource-status'
import {
  contextualPanelReducer,
  createInitialContextualPanelState,
} from './domain/contextual-panel/state'
import { reconcileRouteSelection } from './app/route-selection'
import type { MapSession } from './app/contracts/map'
import { loadTransitMapData, loadVenueData } from './infrastructure/data/loaders'
import { createMapSession } from './infrastructure/map/session'
import { TransitValidationError } from './domain/transit/model'
import { deriveTransitRouteOverlapMap } from './domain/transit/overlap'
import {
  clearTripEndpoint,
  createEmptyTripRequest,
  setTripEndpoint,
  swapTripEndpoints,
  validateTripRequest,
} from './domain/trip/endpoints'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripRequest,
} from './domain/trip/types'
import type { TransitIndex } from './domain/transit'
import type { VenueLocationMap } from './domain/venue/types'
import type { VenueSearchResult } from './domain/venue/search'
import './App.css'

const EMPTY_ROUTE_OVERLAP: ReadonlySet<string> = new Set()

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapSessionRef = useRef<MapSession | null>(null)
  const transitIndexRef = useRef<TransitIndex | null>(null)
  const transitRouteOverlapMapRef = useRef<ReadonlyMap<string, ReadonlySet<string>>>(new globalThis.Map())
  const selectedRouteIdRef = useRef<string | null>(null)
  const contextualPanelStateRef = useRef(createInitialContextualPanelState())
  const [venues, setVenues] = useState<VenueLocationMap | null>(null)
  const [transitIndex, setTransitIndex] = useState<TransitIndex | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [contextualPanelState, dispatchContextualPanel] = useReducer(
    contextualPanelReducer,
    undefined,
    createInitialContextualPanelState,
  )
  const [tripRequest, setTripRequest] = useState<TripRequest>(() => createEmptyTripRequest())
  const [originSearchQuery, setOriginSearchQuery] = useState('')
  const [destinationSearchQuery, setDestinationSearchQuery] = useState('')
  const [resourceStatus, setResourceStatus] = useState(createInitialResourceStatus)
  const [mapError, setMapError] = useState<string | null>(null)
  const status = mapError ?? deriveResourceStatus(resourceStatus)
  const tripValidation = validateTripRequest(tripRequest)

  useEffect(() => {
    contextualPanelStateRef.current = contextualPanelState
  }, [contextualPanelState])

  const handleRouteSelect = useCallback((routeId: string | null) => {
    const networkIndex = transitIndexRef.current
    const selectedRoute = routeId && networkIndex
      ? networkIndex.routeById.get(routeId)
      : undefined
    const nextRouteId = selectedRoute?.id ?? null
    selectedRouteIdRef.current = nextRouteId
    setSelectedRouteId(nextRouteId)

    const overlappingRouteIds = nextRouteId
      ? transitRouteOverlapMapRef.current.get(nextRouteId) ?? EMPTY_ROUTE_OVERLAP
      : EMPTY_ROUTE_OVERLAP
    mapSessionRef.current?.setRouteSelection({
      route: selectedRoute ?? null,
      overlappingRouteIds,
    })
  }, [])

  const handleSetTripEndpoint = useCallback((role: TripEndpointRole, endpoint: TripEndpoint) => {
    setTripRequest((request) => setTripEndpoint(request, role, endpoint))
    if (role === 'origin') {
      setOriginSearchQuery('')
    } else {
      setDestinationSearchQuery('')
    }
  }, [])

  const handleClearTripEndpoint = useCallback((role: TripEndpointRole) => {
    setTripRequest((request) => clearTripEndpoint(request, role))
  }, [])

  const handleSwapTripEndpoints = useCallback(() => {
    setTripRequest((request) => swapTripEndpoints(request))
  }, [])

  const handleClearTrip = useCallback(() => {
    setTripRequest(createEmptyTripRequest())
    setOriginSearchQuery('')
    setDestinationSearchQuery('')
  }, [])

  const clearSelectedVenueMarker = useCallback(() => {
    // Venue details live in the contextual panel; the map only keeps the selected marker.
    mapSessionRef.current?.clearVenue()
  }, [])

  const handleVenueSelect = useCallback((result: VenueSearchResult) => {
    dispatchContextualPanel({ type: 'select-venue', result })
    mapSessionRef.current?.selectVenue(result.venue)
  }, [])

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
    let isMounted = true
    const mapSession = createMapSession({
      container: mapContainer.current,
      onMapError: (error) => {
        console.error('Map error:', error)
        if (isMounted) setMapError('Unable to load map tiles')
      },
      onEmptyMapClick: handlePanelMapClick,
    })
    mapSessionRef.current = mapSession

    const loadVenues = async () => {
      try {
        const venueData = await loadVenueData(controller.signal)
        if (isMounted) {
          setVenues(venueData.venues)
          setResourceStatus((current) => markVenueLoaded(current, venueData.venueCount))
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (isMounted) {
          setResourceStatus((current) => markVenueFailed(current, 'Unable to load venue data'))
        }
        console.error(error)
      }
    }

    const loadTransitNetwork = async () => {
      try {
        const transitData = await loadTransitMapData(controller.signal)
        const routeOverlapMap = deriveTransitRouteOverlapMap(transitData.geometry)

        await mapSession.ready
        mapSession.loadTransitData(
          transitData,
          handleSetTripEndpoint,
        )
        transitIndexRef.current = transitData.index
        transitRouteOverlapMapRef.current = routeOverlapMap
        const reconciledSelection = reconcileRouteSelection(
          transitData.index,
          selectedRouteIdRef.current,
          routeOverlapMap,
        )
        handleRouteSelect(reconciledSelection.route?.id ?? null)
        if (isMounted) {
          setTransitIndex(transitData.index)
          setResourceStatus((current) => markTransitLoaded(current, {
            stopCount: transitData.index.stops.length,
            routeCount: transitData.index.routes.length,
          }))
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        const message = error instanceof TransitValidationError
          ? `Transit route data validation failed: ${error.message}`
          : 'Unable to load shuttle route data'
        if (isMounted) {
          setResourceStatus((current) => markTransitFailed(current, message))
        }
        console.error(error)
      }
    }

    void loadVenues()
    void loadTransitNetwork()

    return () => {
      isMounted = false
      controller.abort()
      mapSession.dispose()
      mapSessionRef.current = null
      transitIndexRef.current = null
      transitRouteOverlapMapRef.current = new globalThis.Map()
      selectedRouteIdRef.current = null
    }
  }, [handlePanelMapClick, handleRouteSelect, handleSetTripEndpoint])

  useEffect(() => {
    mapSessionRef.current?.setTripRequest(
      tripRequest,
      venues ?? {},
      transitIndex,
    )
  }, [tripRequest, transitIndex, venues])

  const selectedRouteColor = transitIndex?.routeById.get(selectedRouteId ?? '')?.color ?? '#334155'

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
            networkIndex={transitIndex}
            searchQuery={originSearchQuery}
            onSearchQueryChange={setOriginSearchQuery}
            onSelect={(endpoint) => handleSetTripEndpoint('origin', endpoint)}
            onClear={() => handleClearTripEndpoint('origin')}
          />
          <TripEndpointControl
            role="destination"
            endpoint={tripRequest.destination}
            venues={venues}
            networkIndex={transitIndex}
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
          state={contextualPanelState}
          venues={venues}
          network={transitIndex?.network ?? null}
          networkIndex={transitIndex}
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
      <div className="map-status" role="status">
        {status}
      </div>
    </main>
  )
}

export default App
