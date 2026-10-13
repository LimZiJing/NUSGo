export { parseApiOrigin, parseCorsOrigins } from './http/api-origin.ts'
export { LOCAL_DATA_VERSION, parseDataVersion, assertCompatibleDataVersion } from './http/data-version.ts'
export type { ApiHealthResponse, ApiReadyResponse, ApiErrorResponse } from './http/api-contracts.ts'

export {
  TransitValidationError,
  validateTransitNetwork,
  validateTransitVerificationManifest,
} from './transit/model.ts'
export { validateBusRouteGeometry } from './transit/geometry.ts'
export { validateTransitMapData } from './transit/map-data.ts'
export {
  generateShuttleTimingData,
  SHUTTLE_TIMING_DATA_VERSION,
  SHUTTLE_TIMING_METHOD,
  SHUTTLE_TIMING_METHOD_VERSION,
  SHUTTLE_TIMING_SOURCE,
  SHUTTLE_TIMING_WAITING_POLICY,
  TransitTimingValidationError,
  validateShuttleTimingData,
} from './transit/timing.ts'
export type {
  TransitGeoJsonPosition,
  TransitNetwork,
  TransitNetworkMetadata,
  BusRoute,
  BusRouteGeometry,
  BusRouteGeometryFeature,
  BusRouteGeometryProperties,
  TransitStop,
  TransitVerificationManifest,
} from './transit/types.ts'
export type { ShuttleTimingData, ShuttleTimingMetadata, ShuttleTimingRecord } from './transit/timing.ts'
export {
  validateVenueLocationMap,
  validateBuildingCatalogue,
  getVenueCount,
  VenueValidationError,
} from './venue/validation.ts'
export type { VenueLocation, VenueLocationMap } from './venue/types.ts'
export type {
  Building,
  BuildingCatalogue,
  BuildingCatalogueSource,
  BuildingSourceRef,
} from './venue/buildings.ts'
export { WALKING_STOP_GRAPH_VERSION, validateWalkingStopGraph } from './routing/walking-stop-graph.ts'
export type { WalkingStopGraph } from './routing/walking-stop-graph.ts'
export type { WalkingConnection } from './routing/walking-connection.ts'
