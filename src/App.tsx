import { useEffect, useRef, useState } from 'react'
import {
  Map,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type LngLatLike,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { BusStop } from './types/transit'
import type { VenueLocationMap } from './types/venues'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

// MapLibre processes vector tiles in a browser worker; Vite bundles this worker
// and provides its URL through the `?worker&url` import above.
setWorkerUrl(maplibreWorkerUrl)

function addVenueMarkers(map: Map, venues: VenueLocationMap): Marker[] {
  const markers: Marker[] = []

  for (const [venueCode, venue] of Object.entries(venues)) {
    if (!venue.location) continue

    // Use DOM nodes instead of setHTML so venue data is treated as text
    // if the dataset ever contains characters meaningful to HTML.
    const popupContent = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = venueCode
    popupContent.append(title)

    const name = document.createElement('div')
    name.textContent = venue.roomName
    popupContent.append(name)

    if (venue.floor !== undefined && venue.floor !== null) {
      const floor = document.createElement('div')
      floor.textContent = `Floor: ${venue.floor}`
      popupContent.append(floor)
    }

    const marker = new Marker({ color: '#d94f70' })
      // Venue coordinates use x=longitude and y=latitude, matching
      // MapLibre's [longitude, latitude] coordinate order.
      .setLngLat([venue.location.x, venue.location.y])
      .setPopup(new Popup({ offset: 24 }).setDOMContent(popupContent))
      .addTo(map)

    markers.push(marker)
  }

  return markers
}

function addBusStopMarkers(map: Map, busStops: BusStop[]): Marker[] {
  const markers: Marker[] = []

  for (const stop of busStops) {
    if (!Number.isFinite(stop.longitude) || !Number.isFinite(stop.latitude)) {
      continue
    }

    // Build popup content with text nodes so values from the dataset are not
    // interpreted as HTML if the data changes in the future.
    const popupContent = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = stop.longName
    popupContent.append(title)

    const code = document.createElement('div')
    code.textContent = `Stop: ${stop.name}`
    popupContent.append(code)

    const routes = document.createElement('div')
    routes.textContent = `Shuttles: ${stop.shuttles.map((shuttle) => shuttle.name).join(', ')}`
    popupContent.append(routes)

    if (stop.opposite) {
      const opposite = document.createElement('div')
      opposite.textContent = `Opposite stop: ${stop.opposite}`
      popupContent.append(opposite)
    }

    const marker = new Marker({ color: '#2563eb' })
      .setLngLat([stop.longitude, stop.latitude])
      .setPopup(new Popup({ offset: 24 }).setDOMContent(popupContent))
      .addTo(map)

    markers.push(marker)
  }

  return markers
}

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
      style: 'https://demotiles.maplibre.org/style.json',
      center: kentRidgeLocation,
      zoom: 15,
    })

    map.addControl(new NavigationControl(), 'top-right')

    const loadVenues = async () => {
      try {
        // Files in `public` are served from the site root, so this resolves to
        // public/data/venues.json in development and in the production build.
        const response = await fetch('/data/venues.json', {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Venue data request failed: ${response.status}`)
        }

        const venues = (await response.json()) as VenueLocationMap
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
        const response = await fetch('/data/bus-stops.json', {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Bus-stop data request failed: ${response.status}`)
        }

        const busStops = (await response.json()) as BusStop[]
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
