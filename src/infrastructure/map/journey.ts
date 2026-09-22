import type { FilterSpecification, LineLayerSpecification, Map } from 'maplibre-gl'
import type { Journey } from '../../domain/trip/journey'

export const JOURNEY_ROUTE_SOURCE_ID = 'journey-route-geometry'
export const JOURNEY_ROUTE_CASING_LAYER_ID = 'journey-route-casing'
export const JOURNEY_WALKING_LAYER_ID = 'journey-walking-lines'
export const JOURNEY_SHUTTLE_LAYER_ID = 'journey-shuttle-lines'

const JOURNEY_WALKING_FILTER: FilterSpecification = ['==', ['get', 'mode'], 'walking']
const JOURNEY_SHUTTLE_FILTER: FilterSpecification = ['==', ['get', 'mode'], 'shuttle']

const JOURNEY_ROUTE_CASING_LAYER: LineLayerSpecification = {
  id: JOURNEY_ROUTE_CASING_LAYER_ID,
  type: 'line',
  source: JOURNEY_ROUTE_SOURCE_ID,
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': '#ffffff',
    'line-opacity': 0.9,
    'line-width': [
      'interpolate',
      ['linear'],
      ['zoom'],
      12, 8,
      15, 10,
      18, 12,
    ],
  },
}

const JOURNEY_WALKING_LAYER: LineLayerSpecification = {
  id: JOURNEY_WALKING_LAYER_ID,
  type: 'line',
  source: JOURNEY_ROUTE_SOURCE_ID,
  filter: JOURNEY_WALKING_FILTER,
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': '#2563eb',
    'line-opacity': 0.95,
    'line-width': [
      'interpolate',
      ['linear'],
      ['zoom'],
      12, 4,
      15, 6,
      18, 8,
    ],
    'line-dasharray': [1, 1.5],
  },
}

const JOURNEY_SHUTTLE_LAYER: LineLayerSpecification = {
  id: JOURNEY_SHUTTLE_LAYER_ID,
  type: 'line',
  source: JOURNEY_ROUTE_SOURCE_ID,
  filter: JOURNEY_SHUTTLE_FILTER,
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': '#d97706',
    'line-opacity': 0.98,
    'line-width': [
      'interpolate',
      ['linear'],
      ['zoom'],
      12, 5,
      15, 7,
      18, 9,
    ],
  },
}

interface JourneyRouteProperties {
  readonly legIndex: number
  readonly mode: Journey['legs'][number]['mode']
  readonly routeId: string | null
}

interface JourneyRouteGeometry {
  readonly type: 'FeatureCollection'
  readonly features: Array<{
    readonly type: 'Feature'
    readonly properties: JourneyRouteProperties
    readonly geometry: {
      readonly type: 'LineString'
      readonly coordinates: Array<[number, number]>
    }
  }>
}

function createJourneyRouteGeometry(journey: Journey): JourneyRouteGeometry {
  return {
    type: 'FeatureCollection',
    features: journey.legs.map((leg, legIndex) => ({
      type: 'Feature',
      properties: {
        legIndex,
        mode: leg.mode,
        routeId: leg.mode === 'shuttle' ? leg.routeId : null,
      },
      geometry: {
        type: 'LineString',
        coordinates: leg.geometry.coordinates.map(([longitude, latitude]) => [longitude, latitude]),
      },
    })),
  }
}

export interface JourneyRouteLayers {
  setJourney(journey: Journey | null): void
  dispose(): void
}

export function createJourneyRouteLayers(map: Map): JourneyRouteLayers {
  let disposed = false

  const clearInstalledJourney = (): void => {
    if (map.getLayer(JOURNEY_SHUTTLE_LAYER_ID)) map.removeLayer(JOURNEY_SHUTTLE_LAYER_ID)
    if (map.getLayer(JOURNEY_WALKING_LAYER_ID)) map.removeLayer(JOURNEY_WALKING_LAYER_ID)
    if (map.getLayer(JOURNEY_ROUTE_CASING_LAYER_ID)) map.removeLayer(JOURNEY_ROUTE_CASING_LAYER_ID)
    if (map.getSource(JOURNEY_ROUTE_SOURCE_ID)) map.removeSource(JOURNEY_ROUTE_SOURCE_ID)
  }

  return {
    setJourney(journey) {
      if (disposed) return
      clearInstalledJourney()
      if (journey === null) return

      try {
        map.addSource(JOURNEY_ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: createJourneyRouteGeometry(journey),
        })
        map.addLayer(JOURNEY_ROUTE_CASING_LAYER)
        map.addLayer(JOURNEY_WALKING_LAYER)
        map.addLayer(JOURNEY_SHUTTLE_LAYER)
      } catch (error) {
        clearInstalledJourney()
        throw error
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      clearInstalledJourney()
    },
  }
}
