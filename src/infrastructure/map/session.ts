import {
  Map,
  NavigationControl,
  setWorkerUrl,
  type MapMouseEvent,
  type Marker,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type LoadedTransitMapData } from '../data/loaders'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripRequest,
} from '../../domain/trip/types'
import type { TransitRoute, TransitStop } from '../../domain/transit/types'
import type { VenueLocation, VenueLocationMap } from '../../domain/venue/types'
import {
  addBusStopMarkers,
  addTripEndpointMarkers,
  addVenueMarker,
  removeBusStopMarkers,
  setBusStopMarkerSelection,
} from './markers'
import { applyBasemapPresentation } from './basemap'
import {
  addTransitRouteLayers,
  fitTransitRoute,
  removeTransitRouteLayers,
  setTransitRouteSelection,
  TRANSIT_ROUTE_CASING_LAYER_ID,
  TRANSIT_ROUTE_DIRECTION_LAYER_ID,
  TRANSIT_ROUTE_LAYER_ID,
  waitForMapStyleLoaded,
} from './transit'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(maplibreWorkerUrl)

export interface MapSessionOptions {
  readonly container: HTMLElement
  readonly onMapError: (error: unknown) => void
  readonly onEmptyMapClick: () => void
}

export interface MapRouteSelection {
  readonly route: TransitRoute | null
  readonly overlappingRouteIds: ReadonlySet<string>
}

export interface MapSession {
  readonly ready: Promise<void>
  loadTransitData(
    data: LoadedTransitMapData,
    onSetEndpoint?: (role: TripEndpointRole, endpoint: TripEndpoint) => void,
  ): number
  setRouteSelection(selection: MapRouteSelection): void
  setTripRequest(
    request: TripRequest,
    venues: VenueLocationMap,
    stops: readonly TransitStop[],
  ): void
  selectVenue(venue: VenueLocation): void
  clearVenue(): void
  dispose(): void
}

export function createMapSession(options: MapSessionOptions): MapSession {
  const controller = new AbortController()
  const map = new Map({
    container: options.container,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [103.7844, 1.2933],
    zoom: 15,
  })

  let selectedVenueMarker: Marker | null = null
  let endpointMarkers: Marker[] = []
  let busStopMarkers: Marker[] = []
  let transitData: LoadedTransitMapData | null = null
  let selectedRouteId: string | null = null
  let disposed = false

  const handleMapError = (event: { error?: unknown }) => {
    options.onMapError(event.error)
  }

  const handleMapClick = (event: MapMouseEvent) => {
    const eventTarget = event.originalEvent.target
    if (eventTarget instanceof Element && eventTarget.closest(
      '.maplibregl-marker, .maplibregl-popup, .maplibregl-control',
    )) return

    const routeLayerIds = [
      TRANSIT_ROUTE_CASING_LAYER_ID,
      TRANSIT_ROUTE_LAYER_ID,
      TRANSIT_ROUTE_DIRECTION_LAYER_ID,
    ].filter((layerId) => map.getLayer(layerId))
    if (routeLayerIds.length > 0 && map.queryRenderedFeatures(
      event.point,
      { layers: routeLayerIds },
    ).length) return

    options.onEmptyMapClick()
  }

  map.addControl(new NavigationControl(), 'top-right')
  map.on('error', handleMapError)
  map.on('click', handleMapClick)

  const ready = waitForMapStyleLoaded(map, controller.signal).then(() => {
    if (!disposed) applyBasemapPresentation(map)
  })

  const clearEndpointMarkers = () => {
    endpointMarkers.forEach((marker) => marker.remove())
    endpointMarkers = []
  }

  const clearSelectedVenueMarker = () => {
    selectedVenueMarker?.remove()
    selectedVenueMarker = null
  }

  const clearBusStopMarkers = () => {
    removeBusStopMarkers(map, busStopMarkers)
    busStopMarkers.forEach((marker) => marker.remove())
    busStopMarkers = []
  }

  return {
    ready,

    loadTransitData(data, onSetEndpoint) {
      if (disposed) return 0

      clearBusStopMarkers()
      transitData = data
      addTransitRouteLayers(map, data.geometry)
      busStopMarkers = addBusStopMarkers(map, data.network.stops, onSetEndpoint)
      return busStopMarkers.length
    },

    setRouteSelection(selection) {
      if (disposed) return

      const nextRouteId = selection.route?.id ?? null
      const routeChanged = nextRouteId !== selectedRouteId
      selectedRouteId = nextRouteId
      setTransitRouteSelection(
        map,
        nextRouteId,
        selection.overlappingRouteIds,
      )
      setBusStopMarkerSelection(
        busStopMarkers,
        selection.route?.stopIds ?? null,
        selection.route?.color ?? null,
      )

      if (
        routeChanged &&
        selection.route &&
        transitData
      ) {
        fitTransitRoute(
          map,
          transitData.network,
          transitData.geometry,
          selection.route.id,
        )
      }
    },

    setTripRequest(request, venues, stops) {
      if (disposed) return

      clearEndpointMarkers()
      endpointMarkers = addTripEndpointMarkers(map, request, venues, [...stops])
    },

    selectVenue(venue) {
      if (disposed) return

      clearSelectedVenueMarker()
      const marker = addVenueMarker(map, venue)
      if (!marker || !venue.location) return

      selectedVenueMarker = marker
      map.flyTo({
        center: [venue.location.x, venue.location.y],
        zoom: Math.max(map.getZoom(), 17),
        essential: true,
      })
    },

    clearVenue() {
      clearSelectedVenueMarker()
    },

    dispose() {
      if (disposed) return
      disposed = true
      controller.abort()
      clearSelectedVenueMarker()
      clearEndpointMarkers()
      clearBusStopMarkers()
      removeTransitRouteLayers(map)
      map.off('error', handleMapError)
      map.off('click', handleMapClick)
      map.remove()
    },
  }
}
