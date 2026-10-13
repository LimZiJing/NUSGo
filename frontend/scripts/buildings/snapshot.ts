import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const BUILDINGS_API_URL = 'https://www.nus-digital-twin.com/api/v1/buildings'
export const SNAPSHOT_DIRECTORY = 'docs/research/nus-digital-twin'

const USER_AGENT = 'NavUS-building-import/1 (+https://github.com/LimZiJing/NavUS; one-off snapshot)'
const DEFAULT_TIMEOUT_MS = 30_000

/** One record of GET /buildings, as documented by NUS Digital Twin (API v1, beta). */
export type ApiBuilding = {
  readonly elementId: string
  readonly name: string
  readonly address: string
  readonly postal: string
  readonly latitude: number
  readonly longitude: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCoordinate(value: unknown, limit: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
}

export function parseBuildingsResponse(input: unknown): readonly ApiBuilding[] {
  if (!Array.isArray(input)) {
    throw new Error('NUS Digital Twin buildings response must be an array')
  }
  if (input.length === 0) {
    throw new Error('NUS Digital Twin buildings response is empty')
  }

  const issues: string[] = []
  const seen = new Set<string>()
  input.forEach((record: unknown, index) => {
    const label = `record ${index + 1}`
    if (!isRecord(record)) {
      issues.push(`${label} must be an object`)
      return
    }
    for (const field of ['elementId', 'name'] as const) {
      const value = record[field]
      if (typeof value !== 'string' || value.trim().length === 0) {
        issues.push(`${label} ${field} must be a non-empty string`)
      }
    }
    for (const field of ['address', 'postal'] as const) {
      if (typeof record[field] !== 'string') issues.push(`${label} ${field} must be a string`)
    }
    if (!isCoordinate(record.latitude, 90)) issues.push(`${label} latitude must be a number from -90 to 90`)
    if (!isCoordinate(record.longitude, 180)) issues.push(`${label} longitude must be a number from -180 to 180`)
    if (typeof record.elementId === 'string') {
      if (seen.has(record.elementId)) issues.push(`Duplicate elementId ${record.elementId}`)
      seen.add(record.elementId)
    }
  })

  if (issues.length > 0) {
    throw new Error(`NUS Digital Twin buildings response is invalid: ${issues.join('; ')}`)
  }
  return input as ApiBuilding[]
}

export interface FetchSnapshotOptions {
  readonly fetch: typeof fetch
  readonly directory: string
  readonly now: Date
  readonly force?: boolean
  readonly timeoutMs?: number
}

export interface FetchSnapshotResult {
  readonly path: string
  readonly count: number
}

/** YYYY-MM-DD for the Singapore calendar day, so file names match the maintainers' dates. */
function singaporeDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(now)
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Downloads GET /buildings once (no credentials) and writes the raw response as a dated,
 * reviewable snapshot. Nothing is written if the request or validation fails.
 */
export async function fetchBuildingsSnapshot(
  options: FetchSnapshotOptions,
): Promise<FetchSnapshotResult> {
  const date = singaporeDate(options.now)
  const path = join(options.directory, `buildings-raw-${date}.json`)
  if (!options.force && await exists(path)) {
    throw new Error(`Snapshot ${path} already exists; pass --force to replace it`)
  }

  const response = await options.fetch(BUILDINGS_API_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`NUS Digital Twin buildings request failed: HTTP ${response.status}`)
  }
  const buildings = parseBuildingsResponse(await response.json() as unknown)

  await mkdir(options.directory, { recursive: true })
  await writeFile(path, `${JSON.stringify(buildings, null, 2)}\n`)
  return { path, count: buildings.length }
}
