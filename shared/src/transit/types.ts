export interface TransitStop {
  readonly id: string
  readonly longName: string
  readonly shortName: string
  readonly latitude: number
  readonly longitude: number
  readonly services: readonly string[]
  readonly opposite?: string | null
}

export interface BusRoute {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly stopIds: readonly string[]
}

export interface TransitStopInput {
  id: string
  longName: string
  shortName: string
  latitude: number
  longitude: number
  services: string[]
  opposite?: string | null
}

export interface BusRouteInput {
  id: string
  name: string
  color: string
  stopIds: string[]
}

export interface TransitNetworkMetadata {
  readonly source: string
  readonly routeStopOrder: string
  readonly routeGeometry: string
  readonly verifiedAt: string
  readonly routeOrderSource: string
  readonly coordinateSource: string
}

export interface TransitNetworkMetadataInput {
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

export interface BusRouteGeometryProperties {
  routeId: string
  name: string
  color: string
}

export interface BusRouteGeometryFeature {
  type: 'Feature'
  properties: BusRouteGeometryProperties
  geometry: {
    type: 'LineString'
    coordinates: TransitGeoJsonPosition[]
  }
}

export interface BusRouteGeometry {
  type: 'FeatureCollection'
  features: BusRouteGeometryFeature[]
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
  readonly version: number
  readonly metadata: TransitNetworkMetadata
  readonly routes: readonly BusRoute[]
  readonly stops: readonly TransitStop[]
}

export interface TransitNetworkInput {
  version: number
  metadata: TransitNetworkMetadataInput
  routes: BusRouteInput[]
  stops: TransitStopInput[]
}
