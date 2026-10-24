import type { ShuttleServiceWindow } from '@nusgo/shared'
import type { NusProviderConfig } from '../../../config.ts'
import {
  createNusBusProxyRequest,
  retryNusRequest,
  type NusAuthenticatedClient,
} from './client.ts'

const SERVICE_WINDOWS_CACHE_TTL_MS = 600_000

export interface NusServiceWindowData {
  readonly observedAt: string
  readonly expiresAt: string
  readonly windows: readonly ShuttleServiceWindow[]
}

export interface NusServiceWindowsProvider {
  load(routeId: string, signal: AbortSignal): Promise<NusServiceWindowData | null>
}

interface NusServiceWindowsProviderOptions {
  readonly provider: NusProviderConfig
  readonly client: NusAuthenticatedClient
  readonly deviceId: string
  readonly retryAttempts: number
  readonly retryBaseDelayMs: number
  readonly now?: () => number
}

function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString()
}

interface RecordValue {
  readonly [key: string]: unknown
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(record: RecordValue, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function parseDates(value: unknown): readonly string[] {
  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((date) => date.trim())
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
}

export function parseNusServiceWindows(
  input: unknown,
  routeId: string,
): readonly ShuttleServiceWindow[] {
  if (!isRecord(input) || !isRecord(input.data)) {
    throw new Error('NUS route service-hour response was invalid')
  }
  const records = input.data.RouteMinMaxTime
  if (!Array.isArray(records)) {
    throw new Error('NUS route service-hour response was invalid')
  }
  return records.flatMap((value) => {
    if (!isRecord(value)) return []
    const firstTime = text(value, ['FirstTime', 'firstTime', 'first_time'])
    const lastTime = text(value, ['LastTime', 'lastTime', 'last_time'])
    const dayType = text(value, ['DayType', 'dayType', 'day_type'])
    if (!firstTime || !lastTime || !dayType) return []
    return [{
      routeId,
      firstTime,
      lastTime,
      dayType,
      dates: parseDates(value.Dates ?? value.dates),
    }]
  })
}

export function createNusServiceWindowsProvider(
  options: NusServiceWindowsProviderOptions,
): NusServiceWindowsProvider {
  const now = options.now ?? Date.now
  const cache = new Map<string, NusServiceWindowData>()
  const inFlight = new Map<string, Promise<NusServiceWindowData | null>>()

  const load = (routeId: string, signal: AbortSignal): Promise<NusServiceWindowData | null> => {
    const cached = cache.get(routeId)
    if (cached && Date.parse(cached.expiresAt) > now()) return Promise.resolve(cached)
    const existing = inFlight.get(routeId)
    if (existing) return existing

    const request = (async (): Promise<NusServiceWindowData | null> => {
      try {
        const payload = await retryNusRequest(() => options.client.requestJson((session) => createNusBusProxyRequest(
          options.provider,
          session,
          options.deviceId,
          'route-min-max-time',
          { route_code: routeId },
        ), 'route-min-max-time', signal), signal, options.retryAttempts, options.retryBaseDelayMs)
        const observedAtMs = now()
        const entry = {
          observedAt: toIso(observedAtMs),
          expiresAt: toIso(observedAtMs + SERVICE_WINDOWS_CACHE_TTL_MS),
          windows: parseNusServiceWindows(payload, routeId),
        }
        cache.set(routeId, entry)
        return entry
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') throw error
        console.warn('NUS route service-hour data unavailable.', {
          routeId,
          errorType: error instanceof Error ? error.name : typeof error,
        })
        return null
      } finally {
        inFlight.delete(routeId)
      }
    })()
    inFlight.set(routeId, request)
    return request
  }

  return { load }
}
