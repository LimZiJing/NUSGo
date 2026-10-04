import { readFile, writeFile } from 'node:fs/promises'
import { generateShuttleTimingData, validateShuttleTimingData } from '../frontend/src/domain/transit/timing.ts'

const args = process.argv.slice(2)
if (!args.includes('--allow-geometry-fallback')) {
  throw new Error(
    'Geometry timing is a fallback. Re-run with --allow-geometry-fallback after reviewing the estimate policy.',
  )
}

const generatedAt = process.env.NAVUS_TIMING_GENERATED_AT ?? new Date().toISOString().slice(0, 10)

const network = JSON.parse(await readFile('frontend/public/data/shuttle-network.json', 'utf8'))
const geometry = JSON.parse(await readFile('frontend/public/data/shuttle-routes.geojson', 'utf8'))
const timing = generateShuttleTimingData(network, geometry, generatedAt)
validateShuttleTimingData(timing, network)
await writeFile('frontend/public/data/shuttle-timing.json', `${JSON.stringify(timing, null, 2)}\n`)
console.log(`Wrote ${timing.records.length} shuttle timing records to frontend/public/data/shuttle-timing.json`)
