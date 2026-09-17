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
}

export interface TransitNetwork {
  version: number
  metadata: TransitNetworkMetadata
  routes: TransitRoute[]
  stops: TransitStop[]
}
