import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Map,
  NavigationControl,
  setWorkerUrl,
  type LngLatLike,
  type Marker,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { TripEndpointControl } from './components/TripEndpointControl'
import { TransitRouteControl } from './components/TransitRouteControl'
import { VenueSearch } from './components/VenueSearch'
import { fetchJson } from './map/data'
import {
  addBusStopMarkers,
  addTripEndpointMarkers,
  addVenueMarker,
  getVenueCount,
} from './map/markers'
import { TransitValidationError } from './transit/model'
import { deriveTransitRouteOverlapMap } from './transit/overlap'
import {
  addTransitRouteLayers,
  fitTransitRoute,
  removeTransitRouteLayers,
  setBusStopMarkerSelection,
  setTransitRouteSelection,
  validateTransitMapData,
  waitForMapStyleLoaded,
} from './transit/render'
import {
  clearTripEndpoint,
  createEmptyTripRequest,
  setTripEndpoint,
  swapTripEndpoints,
  validateTripRequest,
} from './trip/endpoints'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripRequest,
} from './types/trip'
import type { TransitNetwork, TransitRouteGeometry } from './types/transit'
import type { VenueLocationMap } from './types/venues'
import type { VenueSearchResult } from './venue/search'
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
  const transitGeometryRef = useRef<TransitRouteGeometry | null>(null)
  const transitRouteOverlapMapRef = useRef<ReadonlyMap<string, ReadonlySet<string>>>(new globalThis.Map())
  const selectedRouteIdRef = useRef<string | null>(null)
  const [venues, setVenues] = useState<VenueLocationMap | null>(null)
  const [transitNetwork, setTransitNetwork] = useState<TransitNetwork | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [tripRequest, setTripRequest] = useState<TripRequest>(() => createEmptyTripRequest())
  const [originSearchQuery, setOriginSearchQuery] = useState('')
  const [destinationSearchQuery, setDestinationSearchQuery] = useState('')
  const [status, setStatus] = useState('Loading map data…')
  const tripValidation = validateTripRequest(tripRequest)

  const handleRouteSelect = useCallback((routeId: string | null) => {
    const previousRouteId = selectedRouteIdRef.current
    const network = transitNetworkRef.current
    const selectedRoute = routeId && network
      ? network.routes.find((route) => route.id === routeId)
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

  const handleVenueSelect = (result: VenueSearchResult) => {
    const map = mapRef.current
    if (!map || !result.venue.location) return

    selectedVenueMarkerRef.current?.remove()
    const marker = addVenueMarker(map, result.code, result.venue)
    if (!marker) return

    selectedVenueMarkerRef.current = marker
    map.flyTo({
      center: [result.venue.location.x, result.venue.location.y],
      zoom: Math.max(map.getZoom(), 17),
      essential: true,
    })
    marker.togglePopup()
  }

  useEffect(() => {
    if (!mapContainer.current) return

    // Keep fetches and MapLibre objects tied to this component instance.
    const controller = new AbortController()
    const busStopMarkers: Marker[] = []
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

    const loadVenues = async () => {
      try {
        const venueData = await fetchJson<VenueLocationMap>(
          'data/venues.json',
          controller.signal,
          'Venue data',
        )
        venueCount = getVenueCount(venueData)
        if (isMounted) {
          setVenues(venueData)
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

        const [networkInput, geometryInput] = await Promise.all([
          fetchJson<unknown>(
            '/data/shuttle-network.json',

            controller.signal,
            'Shuttle network',
          ),
          fetchJson<unknown>(
            '/data/shuttle-routes.geojson',
            controller.signal,
            'Shuttle route geometry',
          ),
        ])
        const {
          network: transitNetwork,
          geometry,
        } = validateTransitMapData(networkInput, geometryInput)
        const routeOverlapMap = deriveTransitRouteOverlapMap(geometry)

        await waitForMapStyleLoaded(map, controller.signal)
        addTransitRouteLayers(map, geometry)
        const markers = addBusStopMarkers(map, transitNetwork.stops, handleSetTripEndpoint)
        busStopMarkers.push(...markers)
        busStopMarkersRef.current = markers
        transitNetworkRef.current = transitNetwork
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
      busStopMarkers.forEach((marker) => marker.remove())
      busStopMarkersRef.current = []
      transitNetworkRef.current = null
      transitGeometryRef.current = null
      transitRouteOverlapMapRef.current = new globalThis.Map()
      selectedRouteIdRef.current = null
      removeTransitRouteLayers(map)
      mapRef.current = null
      map.remove()
    }
  }, [handleRouteSelect, handleSetTripEndpoint])

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

  return (
    <main className="map-shell">
      <div ref={mapContainer} className="map" />
      <TransitRouteControl
        network={transitNetwork}
        selectedRouteId={selectedRouteId}
        onRouteSelect={handleRouteSelect}
      />
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
        <VenueSearch venues={venues} onSelect={handleVenueSelect} />
      </div>
      <div className="map-legend" aria-label="Map legend">
        <div><span className="legend-marker venue-marker" /> Venues</div>
        <div><span className="legend-marker bus-marker" /> Shuttle stops</div>
        <div><span className="legend-marker origin-marker" /> Origin</div>
        <div><span className="legend-marker destination-marker" /> Destination</div>
      </div>
      <div className="map-status" role="status">
        {status}
      </div>
    </main>
  )
}

export default App
