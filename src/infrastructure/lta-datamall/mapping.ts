export interface LtaPublicBusStopMapping {
  readonly stopId: string
  readonly busStopCode: string
  readonly services: readonly string[]
}

interface RecordValue {
  readonly [key: string]: unknown
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseLtaPublicBusStopMapping(input: unknown): readonly LtaPublicBusStopMapping[] {
  if (!isRecord(input) || !Array.isArray(input.stops)) {
    throw new Error('LTA public bus mapping does not contain a stops array')
  }

  const seen = new Set<string>()
  const mappings: LtaPublicBusStopMapping[] = []
  for (const [index, value] of input.stops.entries()) {
    if (!isRecord(value)) throw new Error(`LTA public bus mapping at index ${index} is invalid`)
    const stopId = readText(value.stopId)
    const busStopCode = readText(value.busStopCode)
    if (!stopId || !/^[A-Za-z0-9._-]{1,80}$/.test(stopId) || !busStopCode || !/^\d{5}$/.test(busStopCode)) {
      throw new Error(`LTA public bus mapping at index ${index} has an invalid stop`)
    }
    if (seen.has(stopId)) throw new Error(`Duplicate LTA public bus stop mapping: ${stopId}`)
    if (!Array.isArray(value.services) || value.services.length === 0) {
      throw new Error(`LTA public bus mapping ${stopId} has no services`)
    }

    const services = value.services.map((service) => readText(service))
    if (services.some((service) => !service || !/^[A-Za-z0-9]{1,8}$/.test(service))) {
      throw new Error(`LTA public bus mapping ${stopId} has invalid services`)
    }
    const uniqueServices = [...new Set(services.filter((service): service is string => service !== null))]
      .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
    seen.add(stopId)
    mappings.push({ stopId, busStopCode, services: uniqueServices })
  }

  return mappings
}
