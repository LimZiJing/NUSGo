import { readFile, writeFile } from 'node:fs/promises'
import { validateTransitNetwork } from '../frontend/src/domain/transit/model.ts'
import { createValhallaRouteEngine } from '../frontend/src/infrastructure/routing/valhalla.ts'
import { validateWalkingStopGraph } from '../frontend/src/infrastructure/routing/walking-stop-graph.ts'

const outputPath = 'frontend/public/data/walking-stop-graph.json'
const baseUrl = process.env.NAVUS_VALHALLA_BASE_URL?.trim() || 'http://127.0.0.1:8002'
const routingDataVersion = process.env.NAVUS_VALHALLA_DATA_VERSION?.trim() || 'local-valhalla'
const timeoutMs = Number(process.env.NAVUS_VALHALLA_TIMEOUT_MS ?? 30_000)

if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
  throw new Error('NAVUS_VALHALLA_TIMEOUT_MS must be a positive integer')
}

const network = validateTransitNetwork(
  JSON.parse(await readFile('frontend/public/data/shuttle-network.json', 'utf8')),
)
const stops = network.stops
const coordinates = stops.map((stop) => ({
  longitude: stop.longitude,
  latitude: stop.latitude,
}))
const routeEngine = createValhallaRouteEngine({ baseUrl })
const connections = await routeEngine.matrixWalking({
  sources: coordinates,
  targets: coordinates,
}, AbortSignal.timeout(timeoutMs))

const expectedConnectionCount = stops.length * stops.length
if (connections.length !== expectedConnectionCount) {
  throw new Error(
    `Valhalla returned ${connections.length} directed stop connections; expected ${expectedConnectionCount}`,
  )
}

const graph = {
  version: 1,
  networkVersion: network.version,
  routingProfile: 'pedestrian',
  routingDataVersion,
  stopIds: stops.map((stop) => stop.id),
  connections: connections
    .filter((connection) => connection.fromIndex !== connection.toIndex)
    .map((connection) => ({
      fromStopId: stops[connection.fromIndex].id,
      toStopId: stops[connection.toIndex].id,
      distanceMeters: connection.distanceMeters,
      durationSeconds: connection.durationSeconds,
    })),
}

validateWalkingStopGraph(graph)
await writeFile(outputPath, `${JSON.stringify(graph, null, 2)}\n`)
console.log(`Wrote ${graph.connections.length} directed walking stop connections to ${outputPath}`)
