import { lstat, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { generateShuttleTimingData, validateShuttleTimingData } from '../shared/src/transit/timing.ts'

const args = process.argv.slice(2)
if (!args.includes('--allow-geometry-fallback')) {
  throw new Error(
    'Geometry timing is a fallback. Re-run with --allow-geometry-fallback after reviewing the estimate policy.',
  )
}

const outputPath = resolve('frontend/public/data/shuttle-timing.json')
try {
  if ((await lstat(outputPath)).isSymbolicLink()) {
    throw new Error('Refusing to overwrite linked shuttle timing data; remove the symlink first.')
  }
} catch (error) {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
}

const generatedAt = process.env.NUSGO_TIMING_GENERATED_AT ?? new Date().toISOString().slice(0, 10)

const network = JSON.parse(await readFile('frontend/public/data/shuttle-network.json', 'utf8'))
const geometry = JSON.parse(await readFile('frontend/public/data/shuttle-routes.geojson', 'utf8'))
const timing = generateShuttleTimingData(network, geometry, generatedAt)
validateShuttleTimingData(timing, network)
await writeFile(outputPath, `${JSON.stringify(timing, null, 2)}\n`)
console.log(`Wrote ${timing.records.length} shuttle timing records to frontend/public/data/shuttle-timing.json`)
