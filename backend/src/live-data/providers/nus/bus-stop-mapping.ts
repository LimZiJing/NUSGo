import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BusArrivalStop } from '../../bus-arrivals/snapshot.ts'

export function parseNusBusStopMapping(
  input: unknown,
  canonicalStops: readonly BusArrivalStop[],
): readonly BusArrivalStop[] {
  if (!Array.isArray(input)) throw new Error('NUS provider stop names are invalid')

  const canonicalStopIds = new Set(canonicalStops.map(({ stopId }) => stopId))
  const providerNames = new Map<string, string>()
  for (const [index, item] of input.entries()) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`NUS provider stop at index ${index} is invalid`)
    }
    const record = item as Record<string, unknown>
    if (typeof record.name !== 'string' || typeof record.longName !== 'string') {
      throw new Error(`NUS provider stop at index ${index} is missing its name`)
    }

    const stopId = record.name.trim()
    const stopName = record.longName.trim()
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(stopId) || stopName.length === 0 || stopName.length > 160) {
      throw new Error(`NUS provider stop at index ${index} has an invalid name`)
    }
    if (!canonicalStopIds.has(stopId)) continue
    if (providerNames.has(stopId)) throw new Error(`Duplicate NUS provider stop: ${stopId}`)
    providerNames.set(stopId, stopName)
  }

  const missingStopIds = canonicalStops
    .filter(({ stopId }) => !providerNames.has(stopId))
    .map(({ stopId }) => stopId)
  if (missingStopIds.length > 0) {
    throw new Error('NUS provider stop names are missing canonical stops: ' + missingStopIds.join(', '))
  }

  return canonicalStops.map(({ stopId }) => {
    const stopName = providerNames.get(stopId)
    if (!stopName) throw new Error(`NUS provider stop name is missing: ${stopId}`)
    return { stopId, stopName }
  })
}

export async function loadNusBusStopMapping(
  dataDirectory: string,
  canonicalStops: readonly BusArrivalStop[],
): Promise<readonly BusArrivalStop[]> {
  let text: string
  try {
    text = await readFile(join(dataDirectory, 'bus-stops.json'), 'utf8')
  } catch {
    throw new Error('NUS provider stop names could not be read')
  }

  let input: unknown
  try {
    input = JSON.parse(text) as unknown
  } catch {
    throw new Error('NUS provider stop names are not valid JSON')
  }
  return parseNusBusStopMapping(input, canonicalStops)
}
