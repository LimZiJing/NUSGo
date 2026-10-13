import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { BuildingCatalogue, BuildingCatalogueSource } from '../../../shared/src/venue/buildings.ts'
import { validateBuildingCatalogue, validateVenueLocationMap } from '../../../shared/src/venue/validation.ts'
import { BUILDING_ALIASES, validateAliases } from './aliases.ts'
import { buildCatalogue } from './catalogue.ts'
import { parseOverrides, parseUnlinkedPrefixes } from './overrides.ts'
import { renderReport } from './report.ts'
import { BUILDINGS_API_URL, fetchBuildingsSnapshot, parseBuildingsResponse, SNAPSHOT_DIRECTORY } from './snapshot.ts'

/** Approved in #332: an import more than 10% smaller than the previous snapshot needs a human. */
const MAX_RECORD_DROP = 0.1
const SNAPSHOT_FILE = /^buildings-raw-(\d{4}-\d{2}-\d{2})\.json$/
const USAGE = 'Usage: npm run buildings:import [-- --fetch [--force]]'

const SOURCE_NAME = 'Buildings: NUS Digital Twin (City Syntax Lab)'
const LICENCE_NOTE = 'Sourced from OpenStreetMap and Google Maps by City Syntax Lab researchers ' +
  '(per the NUS Digital Twin API documentation). Locations are API centroids, except buildings marked provisional-entrance, which use an unverified OpenStreetMap entrance.'

export type CommandPaths = {
  readonly snapshotDirectory: string
  readonly venues: string
  readonly overrides: string
  readonly output: string
  readonly report: string
}

export const DEFAULT_PATHS: CommandPaths = {
  snapshotDirectory: SNAPSHOT_DIRECTORY,
  venues: 'frontend/public/data/venues.json',
  overrides: 'scripts/data/building-overrides.json',
  output: 'frontend/public/data/buildings.json',
  report: `${SNAPSHOT_DIRECTORY}/dedupe-report.md`,
}

export type CommandDependencies = {
  readonly fetch: typeof fetch
  readonly now: Date
  readonly paths: CommandPaths
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

/** Snapshot files, oldest first; YYYY-MM-DD names sort chronologically. */
async function listSnapshots(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => SNAPSHOT_FILE.test(name)).sort()
}

function checkRecordDrop(latest: number, previous: number, previousFile: string): void {
  if (latest < previous * (1 - MAX_RECORD_DROP)) {
    throw new Error(
      `Snapshot has ${latest} records, more than 10% below the ${previous} in ${previousFile}; ` +
        'review the API response before importing',
    )
  }
}

/** Fixed key order and 2-space JSON with a trailing newline, so re-runs are byte-identical. */
function serialiseCatalogue(catalogue: BuildingCatalogue): string {
  return `${JSON.stringify(catalogue, null, 2)}\n`
}

async function importFromSnapshot(paths: CommandPaths): Promise<string> {
  const snapshots = await listSnapshots(paths.snapshotDirectory)
  const latestFile = snapshots.at(-1)
  if (latestFile === undefined) {
    throw new Error(`No buildings-raw-YYYY-MM-DD.json snapshot in ${paths.snapshotDirectory}; run with --fetch first`)
  }
  const apiBuildings = parseBuildingsResponse(await readJson(join(paths.snapshotDirectory, latestFile)))
  const previousFile = snapshots.at(-2)
  if (previousFile !== undefined) {
    const previous = parseBuildingsResponse(await readJson(join(paths.snapshotDirectory, previousFile)))
    checkRecordDrop(apiBuildings.length, previous.length, previousFile)
  }

  const venues = validateVenueLocationMap(await readJson(paths.venues))
  const overridesFile = await readJson(paths.overrides)
  const overrides = parseOverrides(
    overridesFile,
    new Set(apiBuildings.map((building) => building.elementId)),
  )
  const intentionallyUnlinked = parseUnlinkedPrefixes(overridesFile)
  const aliases = validateAliases(BUILDING_ALIASES)
  const source: BuildingCatalogueSource = {
    name: SOURCE_NAME,
    url: BUILDINGS_API_URL,
    fetchedOn: SNAPSHOT_FILE.exec(latestFile)?.[1] as string,
    licenceNote: LICENCE_NOTE,
  }

  const result = buildCatalogue({ apiBuildings, venues, aliases, overrides, intentionallyUnlinked, source })
  validateBuildingCatalogue(result.catalogue)
  const json = serialiseCatalogue(result.catalogue)
  const report = renderReport(result, { snapshotFile: basename(latestFile), aliases })

  // Everything is validated and rendered before the first write, so a failure leaves no output.
  await mkdir(dirname(paths.output), { recursive: true })
  await writeFile(paths.output, json)
  await writeFile(paths.report, report)
  const { roomsLinked, roomsUnlinked } = result.findings.counts
  return `Wrote ${result.catalogue.buildings.length} buildings to ${paths.output} ` +
    `(${roomsLinked} rooms linked, ${roomsUnlinked} unlinked) and the report to ${paths.report}`
}

/**
 * The buildings:import command. With no flags it works fully offline from the latest committed
 * snapshot; only --fetch touches the network.
 */
export async function runBuildingsCommand(
  args: readonly string[],
  dependencies: CommandDependencies,
): Promise<string> {
  const flags = new Set(args)
  const known = args.every((arg) => arg === '--fetch' || arg === '--force')
  if (!known || (flags.has('--force') && !flags.has('--fetch'))) throw new Error(USAGE)

  if (!flags.has('--fetch')) return importFromSnapshot(dependencies.paths)

  const { path, count } = await fetchBuildingsSnapshot({
    fetch: dependencies.fetch,
    directory: dependencies.paths.snapshotDirectory,
    now: dependencies.now,
    force: flags.has('--force'),
  })
  return `Wrote ${count} buildings to ${path}; run npm run buildings:import to regenerate the catalogue`
}
