import { useEffect, useRef } from 'react'
import {type LngLatLike, Map, NavigationControl, setWorkerUrl} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

setWorkerUrl(maplibreWorkerUrl)

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapContainer.current) return

    // initialise Map const
    const KentRidgeLocation: LngLatLike = [103.7844, 1.2933]
    const map = new Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: KentRidgeLocation,
      zoom: 15,
    })

    // add navigation controls for the map
    map.addControl(new NavigationControl(), 'top-right')

    return () => map.remove()
  }, [])

  return <div ref={mapContainer} className="map" />
}

export default App