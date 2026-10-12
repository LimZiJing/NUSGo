import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateBuildingCatalogue } from '@navus/shared/venue/validation'
import { runBuildingsCommand, type CommandPaths } from './command'

function apiBuilding(elementId: string, name: string) {
  return { elementId, name, address: '13 Computing Drive', postal: '117417', latitude: 1.295, longitude: 103.7739 }
}

const SAMPLE = [apiBuilding('54619721', 'COM1'), apiBuilding('54619699', 'COM2')]
const VENUES = {
  'COM1-0201': { roomName: 'Seminar Room 1', floor: 2, location: { x: 103.7739, y: 1.295 } },
  'COM2-0108': { roomName: 'Seminar Room 2', floor: 1, location: { x: 103.7739, y: 1.295 } },
}

describe('runBuildingsCommand', () => {
  let root: string
  let paths: CommandPaths

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'navus-buildings-import-'))
    paths = {
      snapshotDirectory: join(root, 'snapshots'),
      venues: join(root, 'venues.json'),
      overrides: join(root, 'building-overrides.json'),
      output: join(root, 'out', 'buildings.json'),
      report: join(root, 'snapshots', 'dedupe-report.md'),
    }
    await mkdir(paths.snapshotDirectory)
    await mkdir(join(root, 'out'))
    await writeFile(join(paths.snapshotDirectory, 'buildings-raw-2026-10-13.json'), JSON.stringify(SAMPLE))
    await writeFile(paths.venues, JSON.stringify(VENUES))
    await writeFile(paths.overrides, JSON.stringify({ version: 1, overrides: {} }))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function run(args: string[] = [], fetchStub = vi.fn()) {
    return { fetchStub, result: runBuildingsCommand(args, { fetch: fetchStub, now: new Date('2026-10-13T03:00:00Z'), paths }) }
  }

  it('imports offline from the latest snapshot without calling fetch', async () => {
    await writeFile(join(paths.snapshotDirectory, 'buildings-raw-2026-09-01.json'), JSON.stringify(SAMPLE))
    const { fetchStub, result } = run()

    await expect(result).resolves.toMatch(/Wrote 2 buildings/)
    expect(fetchStub).not.toHaveBeenCalled()
    const catalogue = validateBuildingCatalogue(JSON.parse(await readFile(paths.output, 'utf8')))
    expect(catalogue.source).toEqual({
      name: 'Buildings: NUS Digital Twin (City Syntax Lab)',
      url: 'https://www.nus-digital-twin.com/api/v1/buildings',
      fetchedOn: '2026-10-13',
      licenceNote: 'Sourced from OpenStreetMap and Google Maps by City Syntax Lab researchers (per the NUS Digital Twin API documentation). Locations are API centroids, not verified entrances.',
    })
    expect(catalogue.buildings.map((building) => [building.id, building.roomCodePrefixes, building.locationKind])).toEqual([
      ['com1', ['COM1'], 'centroid'],
      ['com2', ['COM2'], 'centroid'],
    ])
    expect(await readFile(paths.report, 'utf8')).toContain('buildings-raw-2026-10-13.json')
  })

  it('writes byte-identical output on a re-run and never touches venues or overrides', async () => {
    const venuesBefore = await readFile(paths.venues, 'utf8')
    const overridesBefore = await readFile(paths.overrides, 'utf8')
    await run().result
    const first = [await readFile(paths.output, 'utf8'), await readFile(paths.report, 'utf8')]
    await run().result

    expect([await readFile(paths.output, 'utf8'), await readFile(paths.report, 'utf8')]).toEqual(first)
    expect(first[0]).toMatch(/^\{\n {2}"version": 1,\n {2}"source": \{/)
    expect(first[0].endsWith('}\n')).toBe(true)
    expect(await readFile(paths.venues, 'utf8')).toBe(venuesBefore)
    expect(await readFile(paths.overrides, 'utf8')).toBe(overridesBefore)
  })

  it('applies overrides from the overrides file', async () => {
    await writeFile(paths.overrides, JSON.stringify({ version: 1, overrides: { 54619721: { name: 'Computing 1' } } }))
    await run().result

    const catalogue = validateBuildingCatalogue(JSON.parse(await readFile(paths.output, 'utf8')))
    expect(catalogue.buildings[0]).toMatchObject({ id: 'com1', name: 'Computing 1' })
  })

  async function expectNoOutput(promise: Promise<string>, message: RegExp) {
    await expect(promise).rejects.toThrow(message)
    await expect(readdir(join(root, 'out'))).resolves.toEqual([])
    expect((await readdir(paths.snapshotDirectory)).includes('dedupe-report.md')).toBe(false)
  }

  it('fails without writing output when the record count drops more than 10% below the previous snapshot', async () => {
    const previous = Array.from({ length: 10 }, (_, index) => apiBuilding(`${index + 1}`, `S${index + 1}`))
    await writeFile(join(paths.snapshotDirectory, 'buildings-raw-2026-09-01.json'), JSON.stringify(previous))
    await writeFile(join(paths.snapshotDirectory, 'buildings-raw-2026-10-13.json'), JSON.stringify(previous.slice(0, 8)))

    await expectNoOutput(run().result, /8 records.*more than 10% below.*10 in buildings-raw-2026-09-01\.json/)

    await writeFile(join(paths.snapshotDirectory, 'buildings-raw-2026-10-13.json'), JSON.stringify(previous.slice(0, 9)))
    await expect(run().result).resolves.toMatch(/Wrote 9 buildings/)
  })

  it('fails without writing output on an empty or invalid snapshot, invalid venues or invalid overrides', async () => {
    const latest = join(paths.snapshotDirectory, 'buildings-raw-2026-10-13.json')
    await writeFile(latest, '[]')
    await expectNoOutput(run().result, /empty/)

    await writeFile(latest, JSON.stringify([{ elementId: '1' }]))
    await expectNoOutput(run().result, /invalid/)

    await writeFile(latest, JSON.stringify(SAMPLE))
    await writeFile(paths.overrides, JSON.stringify({ version: 1, overrides: { 'way/404': {} } }))
    await expectNoOutput(run().result, /way\/404 is not an elementId/)

    await writeFile(paths.overrides, JSON.stringify({ version: 1, overrides: {} }))
    await writeFile(paths.venues, JSON.stringify({ 'COM1-0201': { roomName: '' } }))
    await expectNoOutput(run().result, /roomName/)
  })

  it('fails when the generated catalogue is invalid, such as two overrides claiming one prefix', async () => {
    await writeFile(paths.overrides, JSON.stringify({
      version: 1,
      overrides: { 54619721: { roomCodePrefixes: ['COM1'] }, 54619699: { roomCodePrefixes: ['COM1'] } },
    }))

    await expectNoOutput(run().result, /Room code prefix COM1 is claimed by more than one building/)
  })

  it('fails when there is no snapshot, and rejects unknown arguments', async () => {
    await rm(join(paths.snapshotDirectory, 'buildings-raw-2026-10-13.json'))
    await expectNoOutput(run().result, /No buildings-raw-YYYY-MM-DD\.json snapshot/)
    await expect(run(['--fast']).result).rejects.toThrow(/Usage/)
    await expect(run(['--force']).result).rejects.toThrow(/Usage/)
  })

  it('only calls fetch with --fetch', async () => {
    const fetchStub = vi.fn(async () => new Response(JSON.stringify(SAMPLE), { status: 200 }))
    const { result } = run(['--fetch', '--force'], fetchStub)

    await expect(result).resolves.toMatch(/Wrote 2 buildings to .*buildings-raw-2026-10-13\.json/)
    expect(fetchStub).toHaveBeenCalledTimes(1)
  })
})
