import { useEffect, useRef, useState } from 'react'
import {
  Map,
  NavigationControl,
  setWorkerUrl,
  type LngLatLike,
  type Marker,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { fetchJson } from './map/data'
import { addBusStopMarkers, addVenueMarkers } from './map/markers'
import type { BusStop } from './types/transit'
import type { VenueLocationMap } from './types/venues'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

// MapLibre processes vector tiles in a browser worker; Vite bundles this worker
// and provides its URL through the `?worker&url` import above.
setWorkerUrl(maplibreWorkerUrl)

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Loading map data…')

  useEffect(() => {
    if (!mapContainer.current) return

    // Keep the fetch and map resources tied to this component instance so they
    // can be cancelled or removed together when React runs the cleanup.
    const controller = new AbortController()
    const venueMarkers: Marker[] = []
    const busStopMarkers: Marker[] = []
    let isMounted = true
    const kentRidgeLocation: LngLatLike = [103.7844, 1.2933]
    const map = new Map({
      container: mapContainer.current,
      // OpenFreeMap provides an OSM-based vector style with roads, paths,
      // buildings, and labels for the prototype basemap.
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: kentRidgeLocation,
      zoom: 15,
    })

    map.addControl(new NavigationControl(), 'top-right')
    map.on('error', (event) => {
      console.error('Map error:', event.error)
      if (isMounted) setStatus('Unable to load map tiles')
    })

    const loadVenues = async () => {
      try {
        const venues = await fetchJson<VenueLocationMap>(
          '/data/venues.json',
          controller.signal,
          'Venue data',
        )
        venueMarkers.push(...addVenueMarkers(map, venues))

        if (isMounted) {
          setStatus(`${venueMarkers.length} venues loaded; loading shuttle stops…`)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (isMounted) setStatus('Unable to load venue data')
        console.error(error)
      }
    }

    const loadBusStops = async () => {
      try {
        const busStops = await fetchJson<BusStop[]>(
          '/data/bus-stops.json',
          controller.signal,
          'Bus-stop data',
        )
        busStopMarkers.push(...addBusStopMarkers(map, busStops))

        if (isMounted) {
          setStatus(
            `${venueMarkers.length} venues · ${busStopMarkers.length} shuttle stops loaded`,
          )
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (isMounted) setStatus('Unable to load map data')
        console.error(error)
      }
    }

    void loadVenues()
    void loadBusStops()

    return () => {
      isMounted = false
      // Abort pending work and remove MapLibre objects to avoid stale markers
      // when the component is unmounted or recreated by React.
      controller.abort()
      venueMarkers.forEach((marker) => marker.remove())
      busStopMarkers.forEach((marker) => marker.remove())
      map.remove()
    }
  }, [])

  return (
    <main className="map-shell">
      <div ref={mapContainer} className="map" />
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
