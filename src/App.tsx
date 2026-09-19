import { useCallback, useEffect, useReducer, useRef, useState, type CSSProperties } from 'react'
import {
  Map,
  NavigationControl,
  setWorkerUrl,
  type LngLatLike,
  type MapMouseEvent,
  type Marker,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { ContextualPanel } from './components/ContextualPanel'
import { TripEndpointControl } from './components/TripEndpointControl'
import {
  contextualPanelReducer,
  createInitialContextualPanelState,
} from './contextual-panel/state'
import { applyBasemapPresentation } from './map/basemap'
import {
  addBusStopMarkers,
  addTripEndpointMarkers,
  addVenueMarker,
  removeBusStopMarkers,
  setBusStopMarkerSelection,
} from './map/markers'
import { loadTransitMapData, loadVenueData } from './infrastructure/data/loaders'
import { TransitValidationError } from './domain/transit/validation'
import { deriveTransitRouteOverlapMap } from './domain/transit/overlap'
import {
  addTransitRouteLayers,
  fitTransitRoute,
  removeTransitRouteLayers,
  setTransitRouteSelection,
  TRANSIT_ROUTE_CASING_LAYER_ID,
  TRANSIT_ROUTE_DIRECTION_LAYER_ID,
  TRANSIT_ROUTE_LAYER_ID,
  waitForMapStyleLoaded,
} from './transit/render'
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
import type { TransitNetworkIndex } from './domain/transit'
import type { TransitNetwork, TransitRouteGeometry } from './domain/transit/types'
import type { VenueLocationMap } from './domain/venue/types'
import type { VenueSearchResult } from './domain/venue/search'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

// MapLibre processes vector tiles in a browser worker; Vite bundles this worker
// and provides its URL through the `?worker&url` import above.
setWorkerUrl(maplibreWorkerUrl)

const EMPTY_ROUTE_OVERLAP: ReadonlySet<string> = new Set()

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const selectedVenueMarkerRef = useRef<Marker | null>(null)
  const endpointMarkersRef = useRef<Marker[]>([])
  const busStopMarkersRef = useRef<Marker[]>([])
  const transitNetworkRef = useRef<TransitNetwork | null>(null)
  const transitNetworkIndexRef = useRef<TransitNetworkIndex | null>(null)
  const transitGeometryRef = useRef<TransitRouteGeometry | null>(null)
  const transitRouteOverlapMapRef = useRef<ReadonlyMap<string, ReadonlySet<string>>>(new globalThis.Map())
  const selectedRouteIdRef = useRef<string | null>(null)
  const contextualPanelStateRef = useRef(createInitialContextualPanelState())
  const [venues, setVenues] = useState<VenueLocationMap | null>(null)
  const [transitNetwork, setTransitNetwork] = useState<TransitNetwork | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [contextualPanelState, dispatchContextualPanel] = useReducer(
    contextualPanelReducer,
    undefined,
    createInitialContextualPanelState,
  )
  const [tripRequest, setTripRequest] = useState<TripRequest>(() => createEmptyTripRequest())
  const [originSearchQuery, setOriginSearchQuery] = useState('')
  const [destinationSearchQuery, setDestinationSearchQuery] = useState('')
  const [status, setStatus] = useState('Loading map data…')
  const tripValidation = validateTripRequest(tripRequest)

  useEffect(() => {
    contextualPanelStateRef.current = contextualPanelState
  }, [contextualPanelState])

  const handleRouteSelect = useCallback((routeId: string | null) => {
    const previousRouteId = selectedRouteIdRef.current
    const network = transitNetworkRef.current
    const networkIndex = transitNetworkIndexRef.current
    const selectedRoute = routeId && networkIndex
      ? networkIndex.routeById.get(routeId)
      : undefined
    const nextRouteId = selectedRoute?.id ?? null
    selectedRouteIdRef.current = nextRouteId
    setSelectedRouteId(nextRouteId)

    const map = mapRef.current
    if (map) {
      const overlappingRouteIds = nextRouteId
        ? transitRouteOverlapMapRef.current.get(nextRouteId) ?? EMPTY_ROUTE_OVERLAP
        : EMPTY_ROUTE_OVERLAP
      setTransitRouteSelection(map, nextRouteId, overlappingRouteIds)
      if (nextRouteId !== previousRouteId && network && transitGeometryRef.current) {
        fitTransitRoute(map, network, transitGeometryRef.current, nextRouteId)
      }
    }
    setBusStopMarkerSelection(
      busStopMarkersRef.current,
      selectedRoute?.stopIds ?? null,
      selectedRoute?.color ?? null,
    )
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
    selectedVenueMarkerRef.current?.remove()
    selectedVenueMarkerRef.current = null
  }, [])

  const handleVenueSelect = useCallback((result: VenueSearchResult) => {
    dispatchContextualPanel({ type: 'select-venue', result })
    const map = mapRef.current
    if (!map || !result.venue.location) return

    clearSelectedVenueMarker()
    const marker = addVenueMarker(map, result.venue)
    if (!marker) return

    selectedVenueMarkerRef.current = marker
    map.flyTo({
      center: [result.venue.location.x, result.venue.location.y],
      zoom: Math.max(map.getZoom(), 17),
      essential: true,
    })
  }, [clearSelectedVenueMarker])

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

  const handlePanelMapClick = useCallback((event: MapMouseEvent) => {
    if (contextualPanelStateRef.current.mode !== 'venue-detail') return

    // Only an empty map click dismisses venue detail. Marker, popup, control, and
    // route-line clicks belong to their own interactions.
    const eventTarget = event.originalEvent.target
    if (eventTarget instanceof Element && eventTarget.closest(
      '.maplibregl-marker, .maplibregl-popup, .maplibregl-control',
    )) return

    const routeLayerIds = [
      TRANSIT_ROUTE_CASING_LAYER_ID,
      TRANSIT_ROUTE_LAYER_ID,
      TRANSIT_ROUTE_DIRECTION_LAYER_ID,
    ].filter((layerId) => mapRef.current?.getLayer(layerId))
    if (routeLayerIds.length > 0 && mapRef.current?.queryRenderedFeatures(
      event.point,
      { layers: routeLayerIds },
    ).length) return

    clearSelectedVenueMarker()
    dispatchContextualPanel({ type: 'map-click' })
  }, [clearSelectedVenueMarker])

  useEffect(() => {
    if (!mapContainer.current) return

    // Keep fetches and MapLibre objects tied to this component instance.
    const controller = new AbortController()
    let busStopMarkers: Marker[] = []
    let venueCount = 0
    let isMounted = true
    let transitFailure: string | null = null
    const kentRidgeLocation: LngLatLike = [103.7844, 1.2933]
    const map = new Map({
      container: mapContainer.current,
      // OpenFreeMap provides the OSM-based prototype basemap.
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: kentRidgeLocation,
      zoom: 15,
    })
    mapRef.current = map

    map.addControl(new NavigationControl(), 'top-right')
    map.on('error', (event) => {
      console.error('Map error:', event.error)
      if (isMounted) setStatus('Unable to load map tiles')
    })
    map.on('click', handlePanelMapClick)

    const mapStyleReady = waitForMapStyleLoaded(map, controller.signal).then(() => {
      applyBasemapPresentation(map)
    })

    const loadVenues = async () => {
      try {
        const venueData = await loadVenueData(controller.signal)
        venueCount = venueData.venueCount
        if (isMounted) {
          setVenues(venueData.venues)
          if (!transitFailure) {
            setStatus(`${venueCount} venues available; loading shuttle routes…`)
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (isMounted) setStatus('Unable to load venue data')
        console.error(error)
      }
    }

    const loadTransitNetwork = async () => {
      try {
        const { network: transitNetwork, geometry, index } =
          await loadTransitMapData(controller.signal)
        const routeOverlapMap = deriveTransitRouteOverlapMap(geometry)

        await mapStyleReady
        addTransitRouteLayers(map, geometry)
        const markers = addBusStopMarkers(map, transitNetwork.stops, handleSetTripEndpoint)
        busStopMarkers = markers
        busStopMarkersRef.current = markers
        transitNetworkRef.current = transitNetwork
        transitNetworkIndexRef.current = index
        transitGeometryRef.current = geometry
        transitRouteOverlapMapRef.current = routeOverlapMap
        setTransitNetwork(transitNetwork)

        if (isMounted) {
          setStatus(
            `${venueCount} venues · ${busStopMarkers.length} shuttle stops · ${transitNetwork.routes.length} shuttle routes loaded`,
          )
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        const message = error instanceof TransitValidationError
          ? `Transit route data validation failed: ${error.message}`
          : 'Unable to load shuttle route data'
        transitFailure = message
        if (isMounted) setStatus(message)
        console.error(error)
      }
    }

    void loadVenues()
    void loadTransitNetwork()

    return () => {
      isMounted = false
      // Abort pending work and remove stale MapLibre objects on unmount.
      controller.abort()
      selectedVenueMarkerRef.current?.remove()
      selectedVenueMarkerRef.current = null
      endpointMarkersRef.current.forEach((marker) => marker.remove())
      endpointMarkersRef.current = []
      removeBusStopMarkers(map, busStopMarkers)
      busStopMarkers.forEach((marker) => marker.remove())
      busStopMarkersRef.current = []
      transitNetworkRef.current = null
      transitNetworkIndexRef.current = null
      transitGeometryRef.current = null
      transitRouteOverlapMapRef.current = new globalThis.Map()
      selectedRouteIdRef.current = null
      map.off('click', handlePanelMapClick)
      removeTransitRouteLayers(map)
      mapRef.current = null
      map.remove()
    }
  }, [handlePanelMapClick, handleRouteSelect, handleSetTripEndpoint])

  useEffect(() => {
    endpointMarkersRef.current.forEach((marker) => marker.remove())
    endpointMarkersRef.current = []

    const map = mapRef.current
    if (!map) return

    endpointMarkersRef.current = addTripEndpointMarkers(
      map,
      tripRequest,
      venues ?? {},
      transitNetwork?.stops ?? [],
    )

    return () => {
      endpointMarkersRef.current.forEach((marker) => marker.remove())
      endpointMarkersRef.current = []
    }
  }, [tripRequest, transitNetwork, venues])

  const stops = transitNetwork?.stops ?? []

  const selectedRouteColor = transitNetworkIndexRef.current?.routeById.get(selectedRouteId ?? '')?.color ?? '#334155'

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
          state={contextualPanelState}
          venues={venues}
          network={transitNetwork}
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
