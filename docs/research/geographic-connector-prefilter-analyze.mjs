import { readFile } from 'node:fs/promises'

const inputPath = process.argv[2]
if (!inputPath) throw new Error('Usage: node geographic-connector-prefilter-analyze.mjs <observations.csv>')
const text = await readFile(inputPath, 'utf8')

function parseCsvLine(line) {
  const fields = []
  let field = ''
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (quoted && char === '"' && line[index + 1] === '"') { field += '"'; index++ }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { fields.push(field); field = '' }
    else field += char
  }
  if (quoted) throw new Error('Unclosed CSV quote')
  fields.push(field)
  return fields
}
const lines = text.trimEnd().split(/\r?\n/).map(parseCsvLine)
const headers = lines.shift()
const records = lines.map((line, index) => {
  if (line.length !== headers.length) throw new Error('Bad CSV column count on row ' + (index + 2))
  return Object.fromEntries(headers.map((name, column) => [name, line[column]]))
})
const number = (row, key) => {
  const value = Number(row[key])
  if (!Number.isFinite(value)) throw new Error('Non-finite ' + key + ' in ' + row.endpoint_id)
  return value
}
for (const row of records) {
  for (const key of ['endpoint_lat','endpoint_lon','elapsed_ms','stop_lat','stop_lon','duration_seconds','distance_meters']) number(row, key)
  if (row.http_status !== '200' || row.reachable !== 'true') throw new Error('Unexpected failed/unreachable cell in ' + row.endpoint_id)
}
if (records.length !== 2320) throw new Error('Expected 2,320 matrix cells, got ' + records.length)

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0
const appRank = (a, b) => number(a, 'duration_seconds') - number(b, 'duration_seconds') ||
  number(a, 'distance_meters') - number(b, 'distance_meters') ||
  compareText('stop:' + a.stop_id, 'stop:' + b.stop_id)
function assert(condition, message) { if (!condition) throw new Error(message) }
const selfCheck = () => {
  const rank = (a, b) => a.duration - b.duration || a.distance - b.distance || compareText('stop:' + a.id, 'stop:' + b.id)
  assert([{ id: 'NEAR', duration: 130, distance: 100 }, { id: 'FAST', duration: 90, distance: 400 }].sort(rank)[0].id === 'FAST', 'duration must outrank distance')
  assert([{ id: 'A', duration: 90, distance: 400 }, { id: 'B', duration: 90, distance: 300 }].sort(rank)[0].id === 'B', 'distance must break duration ties')
  assert([{ id: 'B', duration: 90, distance: 300 }, { id: 'A', duration: 90, distance: 300 }].sort(rank)[0].id === 'A', 'stop key must break complete ties')
}
selfCheck()

const groupRows = (endpointId, direction, k) => records.filter((row) => (
  row.endpoint_id === endpointId && row.direction === direction && Number(row.k) === k
))
const endpoints = new Map()
for (const row of records) endpoints.set(row.endpoint_id, {
  id: row.endpoint_id,
  type: row.endpoint_type,
  name: row.endpoint_name,
  lat: number(row, 'endpoint_lat'),
  lon: number(row, 'endpoint_lon'),
})
assert(endpoints.size === 20, 'Expected 20 frozen endpoint locations')
const stops = new Map()
for (const row of records) {
  const stop = { id: row.stop_id, lat: number(row, 'stop_lat'), lon: number(row, 'stop_lon') }
  const prior = stops.get(stop.id)
  if (prior && (prior.lat !== stop.lat || prior.lon !== stop.lon)) throw new Error('Inconsistent stop coordinates')
  stops.set(stop.id, stop)
}
assert(stops.size === 33, 'Expected 33 canonical stops')
const radians = (degrees) => degrees * Math.PI / 180
function haversineMeters(a, b) {
  const dLat = radians(b.lat - a.lat)
  const dLon = radians(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}
const rowsByKey = new Map()
for (const endpoint of endpoints.values()) for (const direction of ['origin', 'destination']) for (const k of [33,5,8,12]) {
  const rows = groupRows(endpoint.id, direction, k)
  assert(rows.length === k, 'Expected one complete matrix for ' + endpoint.id + ' ' + direction + ' k=' + k)
  const ids = new Set(rows.map((row) => row.stop_id))
  assert(ids.size === k, 'Duplicate stop cell in ' + endpoint.id + ' ' + direction + ' k=' + k)
  const elapsed = new Set(rows.map((row) => row.elapsed_ms))
  assert(elapsed.size === 1, 'Matrix rows must share one request latency')
  rowsByKey.set(endpoint.id + '|' + direction + '|' + k, rows)
}

const percentile = (sorted, p) => sorted[Math.ceil(sorted.length * p) - 1]
const latency = []
for (const direction of ['origin', 'destination']) for (const k of [33,5,8,12]) {
  const values = [...endpoints.values()].map((endpoint) => number(groupRows(endpoint.id, direction, k)[0], 'elapsed_ms')).sort((a, b) => a - b)
  latency.push({
    direction, k, calls: values.length, cells: values.length * k,
    medianMs: +((values[9] + values[10]) / 2).toFixed(2),
    p95Ms: +percentile(values, 0.95).toFixed(2),
    minMs: +values[0].toFixed(2), maxMs: +values.at(-1).toFixed(2),
  })
}
const quality = []
const fullTop5ByEndpoint = new Map()
for (const endpoint of endpoints.values()) for (const direction of ['origin', 'destination']) {
  const full = [...rowsByKey.get(endpoint.id + '|' + direction + '|33')].sort(appRank)
  assert(full.length >= 5, 'Expected five reachable full-network connectors')
  const fullTop5 = full.slice(0, 5)
  fullTop5ByEndpoint.set(endpoint.id + '|' + direction, fullTop5.map((row) => row.stop_id))
  const geo = [...stops.values()].sort((a, b) => (
    haversineMeters(endpoint, a) - haversineMeters(endpoint, b) || compareText(a.id, b.id)
  ))
  const geoRank = new Map(geo.map((stop, index) => [stop.id, index + 1]))
  for (const k of [5,8,12]) {
    const geoIds = new Set(geo.slice(0, k).map((stop) => stop.id))
    const retained = fullTop5.filter((row) => geoIds.has(row.stop_id))
    const short = [...rowsByKey.get(endpoint.id + '|' + direction + '|' + k)].sort(appRank)
    const bestGap = number(short[0], 'duration_seconds') - number(fullTop5[0], 'duration_seconds')
    quality.push({
      endpointId: endpoint.id, direction, k, retained: retained.length,
      top1Retained: geoIds.has(fullTop5[0].stop_id),
      top1GeoRank: geoRank.get(fullTop5[0].stop_id), bestWalkGapSeconds: bestGap,
    })
  }
}
const retentionSummary = []
for (const direction of ['origin', 'destination']) for (const k of [5,8,12]) {
  const group = quality.filter((row) => row.direction === direction && row.k === k)
  const gaps = group.map((row) => row.bestWalkGapSeconds).sort((a, b) => a - b)
  retentionSummary.push({
    direction, k, fullTop5Entries: group.length * 5,
    retainedEntries: group.reduce((sum, row) => sum + row.retained, 0),
    exactTop5Endpoints: group.filter((row) => row.retained === 5).length,
    endpointsMissingTop1: group.filter((row) => !row.top1Retained).map((row) => ({ endpointId: row.endpointId, geoRank: row.top1GeoRank, gapSeconds: row.bestWalkGapSeconds })),
    bestWalkingConnectorGapMedianSeconds: +((gaps[9] + gaps[10]) / 2).toFixed(2),
    bestWalkingConnectorGapMaxSeconds: gaps.at(-1),
  })
}
let directionalCellDifferences = 0
let pairedFullCells = 0
for (const endpoint of endpoints.values()) {
  const origin = new Map(rowsByKey.get(endpoint.id + '|origin|33').map((row) => [row.stop_id, row]))
  const destination = new Map(rowsByKey.get(endpoint.id + '|destination|33').map((row) => [row.stop_id, row]))
  for (const stopId of stops.keys()) {
    const a = origin.get(stopId)
    const b = destination.get(stopId)
    pairedFullCells++
    if (a.duration_seconds !== b.duration_seconds || a.distance_meters !== b.distance_meters) directionalCellDifferences++
  }
}
const changedTop5Endpoints = [...endpoints.keys()].filter((id) => {
  const origin = new Set(fullTop5ByEndpoint.get(id + '|origin'))
  const destination = new Set(fullTop5ByEndpoint.get(id + '|destination'))
  return origin.size !== destination.size || [...origin].some((stopId) => !destination.has(stopId))
})
console.log(JSON.stringify({
  csvRows: records.length,
  endpoints: endpoints.size,
  stops: stops.size,
  matrixCalls: 160,
  failures: 0,
  latency,
  retentionSummary,
  directionality: { pairedCells: pairedFullCells, cellsWithDifferentRoundedMetrics: directionalCellDifferences, endpointsWithDifferentFullTop5: changedTop5Endpoints },
}, null, 2))
