import { useEffect, useRef, useState } from 'react'
import {
  Map,
  NavigationControl,
  setWorkerUrl,
  type LngLatLike,
  type Marker,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { VenueSearch } from './components/VenueSearch'
import { fetchJson } from './map/data'
import { addVenueMarker, getVenueCount } from './map/markers'
import { TransitValidationError } from './transit/model'
import { addValidatedBusStopMarkers } from './transit/render'
import type { VenueLocationMap } from './types/venues'
import type { VenueSearchResult } from './venue/search'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

// MapLibre processes vector tiles in a browser worker; Vite bundles this worker
// and provides its URL through the `?worker&url` import above.
setWorkerUrl(maplibreWorkerUrl)

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const selectedVenueMarkerRef = useRef<Marker | null>(null)
  const [venues, setVenues] = useState<VenueLocationMap | null>(null)
  const [status, setStatus] = useState('Loading map data…')

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
          setStatus(`${venueCount} venues available; loading shuttle stops…`)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (isMounted) setStatus('Unable to load venue data')
        console.error(error)
      }
    }

    const loadTransitNetwork = async () => {
      try {
        const { network: transitNetwork, markers } = addValidatedBusStopMarkers(
          map,
          await fetchJson<unknown>(
            'data/shuttle-network.json',
            controller.signal,
            'Shuttle network',
          ),
        )
        busStopMarkers.push(...markers)

        if (isMounted) {
          setStatus(
            `${venueCount} venues · ${busStopMarkers.length} shuttle stops · ${transitNetwork.routes.length} shuttle routes loaded`,
          )
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (isMounted) {
          const message = error instanceof TransitValidationError
            ? `Transit data validation failed: ${error.message}`
            : 'Unable to load shuttle network'
          setStatus(message)
        }
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
      busStopMarkers.forEach((marker) => marker.remove())
      mapRef.current = null
      map.remove()
    }
  }, [])

  return (
    <main className="map-shell">
      <div ref={mapContainer} className="map" />
      <VenueSearch venues={venues} onSelect={handleVenueSelect} />
      <div className="map-legend" aria-label="Map legend">
        <div><span className="legend-marker venue-marker" /> Venues</div>
        <div><span className="legend-marker bus-marker" /> Shuttle stops</div>
      </div>
      <div className="map-status" role="status">
        {status}
      </div>
    </main>
  )
}

export default App
