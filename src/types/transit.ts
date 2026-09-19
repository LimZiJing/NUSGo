export interface TransitStop {
  id: string
  longName: string
  shortName: string
  latitude: number
  longitude: number
  services: string[]
  opposite?: string | null
}

export interface TransitRoute {
  id: string
  name: string
  color: string
  stopIds: string[]
}

export interface TransitNetworkMetadata {
  source: string
  routeStopOrder: string
  routeGeometry: string
  verifiedAt: string
  routeOrderSource: string
  coordinateSource: string
}

export interface TransitGeometryVerification {
  source: string
  reviewedAt: string
  reviewNotes: string
}

export type TransitGeoJsonPosition = [longitude: number, latitude: number]

export interface TransitRouteGeometryProperties {
  routeId: string
  name: string
  color: string
}

export interface TransitRouteGeometryFeature {
  type: 'Feature'
  properties: TransitRouteGeometryProperties
  geometry: {
    type: 'LineString'
    coordinates: TransitGeoJsonPosition[]
  }
}

export interface TransitRouteGeometry {
  type: 'FeatureCollection'
  features: TransitRouteGeometryFeature[]
}

export interface TransitVerificationRoute {
  routeId: string
  direction: string
  orderedStopIds: string[]
}

export interface TransitVerificationManifest {
  version: number
  reviewedAt: string
  routeOrderSource: string
  coordinateSource: string
  routes: TransitVerificationRoute[]
  geometry: TransitGeometryVerification
}

export interface TransitNetwork {
  version: number
  metadata: TransitNetworkMetadata
  routes: TransitRoute[]
  stops: TransitStop[]
}
