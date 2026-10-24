import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertCompatibleDataVersion,
  generateShuttleTimingData,
  validateTransitMapData,
} from '@nusgo/shared'
import { describe, it } from 'node:test'
import { loadCanonicalData, validateCanonicalData } from './canonical-data.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sourceData = resolve(repositoryRoot, 'frontend/public/data')

async function readJson(filename: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(sourceData, filename), 'utf8')) as unknown
}

async function readInputs() {
  const [venues, buildings, network, routeGeometry, walkingStopGraph] = await Promise.all([
    readJson('venues.json'),
    readJson('buildings.json'),
    readJson('shuttle-network.json'),
    readJson('shuttle-routes.geojson'),
    readJson('walking-stop-graph.json'),
  ])
  const transit = validateTransitMapData(network, routeGeometry)
  const shuttleTiming = generateShuttleTimingData(
    transit.network,
    transit.geometry,
    transit.network.metadata.verifiedAt,
  )
  return { venues, buildings, network, routeGeometry, walkingStopGraph, shuttleTiming }
}

describe('canonical backend data', () => {
  it('validates all inputs from the frontend data source and reports their counts', async () => {
    const data = validateCanonicalData(await readInputs(), 'development')

    assert.equal(data.counts.stops, 33)
    assert.equal(data.counts.walkingConnections, 33 * 32)
    assert.ok(data.counts.venues > 0)
    assert.equal(data.counts.buildings, data.buildings.buildings.length)
  })

  it('rejects an invalid building catalogue at startup', async () => {
    const inputs = await readInputs()

    assert.throws(() => validateCanonicalData({
      ...inputs,
      buildings: { version: 1, buildings: [{ id: '' }] },
    }, 'development'), /Building catalogue source/)
  })

  it('rejects a walking graph built for a different network', async () => {
    const inputs = await readInputs()
    const graph = inputs.walkingStopGraph as Record<string, unknown>

    assert.throws(() => validateCanonicalData({
      ...inputs,
      walkingStopGraph: { ...graph, networkVersion: 2 },
    }, 'development'), /networkVersion/)
  })

  it('loads and validates the same files used by the frontend from a data directory', async () => {
    const inputs = await readInputs()
    const directory = await mkdtemp(resolve(tmpdir(), 'nusgo-data-'))
    try {
      await Promise.all([
        writeFile(resolve(directory, 'venues.json'), JSON.stringify(inputs.venues)),
        writeFile(resolve(directory, 'buildings.json'), JSON.stringify(inputs.buildings)),
        writeFile(resolve(directory, 'shuttle-network.json'), JSON.stringify(inputs.network)),
        writeFile(resolve(directory, 'shuttle-routes.geojson'), JSON.stringify(inputs.routeGeometry)),
        writeFile(resolve(directory, 'shuttle-timing.json'), JSON.stringify(inputs.shuttleTiming)),
        writeFile(resolve(directory, 'walking-stop-graph.json'), JSON.stringify(inputs.walkingStopGraph)),
      ])
      const data = await loadCanonicalData(directory, 'development')
      assert.equal(data.counts.routes, 8)
      assert.equal(data.dataVersion, 'development')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('requires Pages and backend source revisions to match', () => {
    const version = 'a'.repeat(40)
    assert.doesNotThrow(() => assertCompatibleDataVersion(version, version))
    assert.throws(() => assertCompatibleDataVersion(version, 'b'.repeat(40)), /do not match/)
  })
})
