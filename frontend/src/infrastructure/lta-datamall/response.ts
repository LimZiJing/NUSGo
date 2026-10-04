import type { PublicBusEstimatedArrival } from '../../domain/transit/public-bus-arrivals.js'

export interface ParsedLtaServiceArrival {
  readonly serviceNumber: string
  readonly arrivals: readonly PublicBusEstimatedArrival[]
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

function parseMonitored(value: unknown, serviceNumber: string): boolean {
  if (value === 0 || value === '0') return false
  if (value === 1 || value === '1') return true
  throw new Error(`LTA arrival for service ${serviceNumber} has an invalid monitored flag`)
}

function parseEstimatedArrival(value: unknown, serviceNumber: string): PublicBusEstimatedArrival | null {
  if (value === undefined || value === null) return null
  if (!isRecord(value)) throw new Error(`LTA arrival for service ${serviceNumber} is invalid`)
  const estimatedArrival = value.EstimatedArrival
  if (estimatedArrival === undefined || estimatedArrival === null || estimatedArrival === '') return null
  if (typeof estimatedArrival !== 'string' || !Number.isFinite(Date.parse(estimatedArrival))) {
    throw new Error(`LTA arrival for service ${serviceNumber} has an invalid estimated arrival`)
  }
  return {
    estimatedAt: estimatedArrival,
    monitored: parseMonitored(value.Monitored, serviceNumber),
  }
}

export function parseLtaBusArrivalResponse(
  input: unknown,
  expectedServices: readonly string[],
): readonly ParsedLtaServiceArrival[] {
  if (!isRecord(input) || !Array.isArray(input.Services)) {
    throw new Error('LTA bus arrival response does not contain a Services array')
  }

  const expected = new Set(expectedServices)
  const parsed = new Map<string, PublicBusEstimatedArrival[]>()
  for (const value of input.Services) {
    if (!isRecord(value)) throw new Error('LTA bus arrival response contains an invalid service')
    const serviceNumber = readText(value.ServiceNo)
    if (!serviceNumber || !expected.has(serviceNumber)) continue

    const arrivals: PublicBusEstimatedArrival[] = []
    for (const field of ['NextBus', 'NextBus2', 'NextBus3']) {
      const arrival = parseEstimatedArrival(value[field], serviceNumber)
      if (arrival) arrivals.push(arrival)
    }
    parsed.set(serviceNumber, arrivals)
  }

  return [...parsed.entries()].map(([serviceNumber, arrivals]) => ({ serviceNumber, arrivals }))
}
