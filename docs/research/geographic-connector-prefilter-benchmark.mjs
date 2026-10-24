import { createHash } from 'node:crypto'
import { open, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

// This script deliberately sends 160 requests to an already-running local Valhalla.
// It requires an explicit --run flag and never starts, stops, or configures services.
const args = process.argv.slice(2)
if (!args.includes('--run')) {
  throw new Error('Pass --run only when ready to query the existing local Valhalla service')
}
const outputArgument = args.find((arg) => arg.startsWith('--output='))
if (!outputArgument) throw new Error('Pass --output=<csv-path> to avoid overwriting evidence')
const outputPath = resolve(outputArgument.slice('--output='.length))
const baseUrl = 'http://127.0.0.1:8002'
const kValues = [33, 5, 8, 12]
const expectedHashes = {
  network: '8997d813c8ef3c3d0b7acfe163c06eb3ddb936bfbb0357d0d7fcea5c51d8d14f',
  busSnapshot: '46907fcb264785d40fbc515fa3055c5d401c7638c45891765747ae2b3f0bb136',
  buildings: '8377848cf85f9b6c5eb49e6aa825eac79167f782c8e4ced654dbd18bc0ca480e',
}
const endpointSpecs = [
  ['building:pgp-mpsh-minimart', 'building-endpoint', 'PGP MPSH / Minimart', 1.290337, 103.7812616],
  ['building:rc4-multi-purpose-hall', 'building-endpoint', 'RC4 Multi-Purpose Hall', 1.30836, 103.77297],
  ['building:eusoff-hall-block-a', 'building-endpoint', 'Eusoff Hall', 1.29349, 103.76968],
  ['building:pgp-residence-1-block-1', 'building-endpoint', 'PGP Residence 1', 1.29155, 103.7829],
  ['building:university-health-centre', 'building-endpoint', 'University Health Centre', 1.29905, 103.77643],
  ['building:ew1a', 'building-endpoint', 'EW1A', 1.29943, 103.77038],
  ['building:sheares-block-a', 'building-endpoint', 'Sheares Hall', 1.29151, 103.77531],
  ['building:medicine-science-library', 'building-endpoint', 'Medicine + Science Library', 1.2969695, 103.7816129],
  ['building:town-plaza', 'building-endpoint', 'Town Plaza', 1.3039, 103.77398],
  ['building:lt-14', 'building-endpoint', 'LT 14', 1.29571, 103.77337],
  ['building:s2', 'building-endpoint', 'S2', 1.29546, 103.77801],
  ['building:kuok-foundation-house-block-7-and-8', 'building-endpoint', 'Kuok Foundation House (Block 7 & 8)', 1.30034, 103.77361],
  ['building:king-edward-vii-hall-block-f-1', 'building-endpoint', 'King Edward VII Hall', 1.29327, 103.78035],
  ['building:saga-college-5', 'building-endpoint', 'Saga College', 1.30585, 103.77179],
  ['building:temasek-hall-block-e', 'building-endpoint', 'Temasek Hall', 1.29265, 103.77221],
  ['building:sde4', 'building-endpoint', 'SDE4', 1.29681, 103.77035],
  ['current-west-coast-side', 'synthetic-current-location', 'West/south edge', 1.2924, 103.763],
  ['current-utown-edge', 'synthetic-current-location', 'UTown/north edge', 1.3076, 103.7734],
  ['current-pgp-edge', 'synthetic-current-location', 'PGP/south-east edge', 1.2908, 103.782],
  ['current-bukit-timah', 'synthetic-current-location', 'Bukit Timah campus', 1.3215, 103.8169],
]
const endpoints = endpointSpecs.map(([id, type, name, lat, lon]) => ({ id, type, name, lat, lon }))
const repoRoot = process.cwd()
const networkText = await readFile(resolve(repoRoot, 'frontend/public/data/shuttle-network.json'), 'utf8')
const busSnapshotText = await readFile(resolve(repoRoot, 'frontend/public/data/bus-stops.json'), 'utf8')
const buildingText = await readFile(resolve(repoRoot, 'frontend/public/data/buildings.json'), 'utf8')
const actualHashes = {
  network: createHash('sha256').update(networkText).digest('hex'),
  busSnapshot: createHash('sha256').update(busSnapshotText).digest('hex'),
  buildings: createHash('sha256').update(buildingText).digest('hex'),
}
if (JSON.stringify(actualHashes) !== JSON.stringify(expectedHashes)) {
  throw new Error('Canonical input hashes differ from the frozen research sample')
}
const stops = JSON.parse(networkText).stops.map(({ id, latitude, longitude }) => ({
  id, lat: latitude, lon: longitude,
}))
const busSnapshot = JSON.parse(busSnapshotText).map(({ name, latitude, longitude }) => ({
  id: name, lat: latitude, lon: longitude,
}))
if (stops.length !== 33) throw new Error('Expected exactly 33 canonical stops')
const busById = new Map(busSnapshot.map((stop) => [stop.id, stop]))
if (busById.size !== stops.length || stops.some((stop) => {
  const snapshot = busById.get(stop.id)
  return !snapshot || snapshot.lat !== stop.lat || snapshot.lon !== stop.lon
})) throw new Error('Measured bus-stop snapshot differs from canonical shuttle network coordinates')
const buildings = new Map(JSON.parse(buildingText).buildings.map((building) => [building.id, building]))
const sampledBuildings = endpoints.filter((endpoint) => endpoint.id.startsWith('building:'))
if (sampledBuildings.length !== 16 || sampledBuildings.some((endpoint) => {
  const building = buildings.get(endpoint.id.slice('building:'.length))
  return !building || building.name !== endpoint.name ||
    building.location.y !== endpoint.lat || building.location.x !== endpoint.lon
})) throw new Error('Frozen building endpoints differ from canonical building data')

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0
function haversineMeters(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180
  const dLat = radians(b.lat - a.lat)
  const dLon = radians(b.lon - a.lon)
  const lat1 = radians(a.lat)
  const lat2 = radians(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}
function csv(value) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text
}
function flattenCells(value) {
  if (!Array.isArray(value)) return []
  return Array.isArray(value[0]) ? value.flat() : value
}

const rows = [[
  'endpoint_id','endpoint_type','endpoint_name','endpoint_lat','endpoint_lon',
  'direction','k','elapsed_ms','http_status','stop_id','stop_lat','stop_lon',
  'reachable','duration_seconds','distance_meters',
]]
// Claim the destination before requests and keep the exclusive handle through
// the final write, so existing evidence cannot be overwritten or raced.
const outputHandle = await open(outputPath, 'wx')
try {
for (let endpointIndex = 0; endpointIndex < endpoints.length; endpointIndex++) {
  const endpoint = endpoints[endpointIndex]
  const geoStops = [...stops].sort((a, b) => (
    haversineMeters(endpoint, a) - haversineMeters(endpoint, b) || compareText(a.id, b.id)
  ))
  for (const direction of ['origin', 'destination']) {
    const variants = [...kValues]
    const rotation = (endpointIndex + (direction === 'origin' ? 0 : 1)) % variants.length
    const order = [...variants.slice(rotation), ...variants.slice(0, rotation)]
    for (const k of order) {
      const chosen = k === 33 ? stops : geoStops.slice(0, k)
      const payload = direction === 'origin'
        ? { sources: [{ lat: endpoint.lat, lon: endpoint.lon }], targets: chosen.map(({ lat, lon }) => ({ lat, lon })) }
        : { sources: chosen.map(({ lat, lon }) => ({ lat, lon })), targets: [{ lat: endpoint.lat, lon: endpoint.lon }] }
      const startedAt = performance.now()
      const response = await fetch(baseUrl + '/sources_to_targets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, costing: 'pedestrian', units: 'kilometers', verbose: true }),
        signal: AbortSignal.timeout(15000),
      })
      const bodyText = await response.text()
      const elapsedMs = +(performance.now() - startedAt).toFixed(3)
      if (!response.ok) throw new Error('Valhalla returned HTTP ' + response.status)
      const body = JSON.parse(bodyText)
      const cells = flattenCells(body.sources_to_targets)
      if (cells.length !== k) throw new Error('Expected ' + k + ' cells, got ' + cells.length)
      const normalized = cells.map((cell, index) => {
        const fromIndex = Number.isInteger(cell.from_index) ? cell.from_index : direction === 'origin' ? 0 : index
        const toIndex = Number.isInteger(cell.to_index) ? cell.to_index : direction === 'origin' ? index : 0
        const stop = chosen[direction === 'origin' ? toIndex : fromIndex]
        if (!stop) throw new Error('Matrix cell index is outside the selected stop list')
        const reachable = Number.isFinite(cell.time) && Number.isFinite(cell.distance)
        if (!reachable) throw new Error('Unexpected unreachable cell; preserve this as a failed sample before analysis')
        return { stop, duration: Math.round(cell.time), distance: Math.round(cell.distance * 1000) }
      })
      for (const { stop, duration, distance } of normalized) rows.push([
        endpoint.id,endpoint.type,endpoint.name,endpoint.lat,endpoint.lon,direction,k,
        elapsedMs,response.status,stop.id,stop.lat,stop.lon,true,duration,distance,
      ])
      console.log(endpoint.id + ' ' + direction + ' k=' + k + ' ' + elapsedMs + 'ms')
    }
  }
}
if (rows.length !== 2321) throw new Error('Expected 2,320 observation cells')
await outputHandle.writeFile(rows.map((row) => row.map(csv).join(',')).join('\n') + '\n', 'utf8')
} finally {
  await outputHandle.close()
}
console.log('Wrote 2,320 observations to ' + outputPath)
