import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  parseDataVersion,
  validateShuttleTimingData,
  validateTransitMapData,
  validateVenueLocationMap,
  validateWalkingStopGraph,
} from '@navus/shared'
import type {
  ShuttleTimingData,
  TransitNetwork,
  TransitRouteGeometry,
  VenueLocationMap,
  WalkingStopGraph,
} from '@navus/shared'

export interface CanonicalDataInputs {
  readonly venues: unknown
  readonly network: unknown
  readonly routeGeometry: unknown
  readonly shuttleTiming: unknown
  readonly walkingStopGraph: unknown
}

export interface BackendData {
  readonly dataVersion: string
  readonly venues: VenueLocationMap
  readonly network: TransitNetwork
  readonly routeGeometry: TransitRouteGeometry
  readonly shuttleTiming: ShuttleTimingData
  readonly walkingStopGraph: WalkingStopGraph
  readonly counts: {
    readonly venues: number
    readonly routes: number
    readonly stops: number
    readonly walkingConnections: number
  }
}

async function readJson(directory: string, filename: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(join(directory, filename), 'utf8')
  } catch {
    throw new Error(`Canonical data file ${filename} could not be read`)
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`Canonical data file ${filename} is not valid JSON`)
  }
}

export function validateCanonicalData(
  inputs: CanonicalDataInputs,
  dataVersion: string,
): BackendData {
  const version = parseDataVersion(dataVersion)
  const venues = validateVenueLocationMap(inputs.venues)
  const transit = validateTransitMapData(inputs.network, inputs.routeGeometry)
  const shuttleTiming = validateShuttleTimingData(inputs.shuttleTiming, transit.network)
  const walkingStopGraph = validateWalkingStopGraph(inputs.walkingStopGraph)

  if (walkingStopGraph.networkVersion !== transit.network.version) {
    throw new Error('Walking stop graph networkVersion does not match the transit network')
  }
  const networkStopIds = new Set(transit.network.stops.map((stop) => stop.id))
  if (
    walkingStopGraph.stopIds.length !== networkStopIds.size ||
    walkingStopGraph.stopIds.some((stopId) => !networkStopIds.has(stopId))
  ) {
    throw new Error('Walking stop graph stopIds do not match the canonical transit network')
  }

  return Object.freeze({
    dataVersion: version,
    venues,
    network: transit.network,
    routeGeometry: transit.geometry,
    shuttleTiming,
    walkingStopGraph,
    counts: Object.freeze({
      venues: Object.keys(venues).length,
      routes: transit.network.routes.length,
      stops: transit.network.stops.length,
      walkingConnections: walkingStopGraph.connections.length,
    }),
  })
}

export async function loadCanonicalData(
  directory: string,
  dataVersion: string,
): Promise<BackendData> {
  const [venues, network, routeGeometry, shuttleTiming, walkingStopGraph] = await Promise.all([
    readJson(directory, 'venues.json'),
    readJson(directory, 'shuttle-network.json'),
    readJson(directory, 'shuttle-routes.geojson'),
    readJson(directory, 'shuttle-timing.json'),
    readJson(directory, 'walking-stop-graph.json'),
  ])

  return validateCanonicalData({
    venues,
    network,
    routeGeometry,
    shuttleTiming,
    walkingStopGraph,
  }, dataVersion)
}
