import type {
  ServiceAnnouncementPriority,
  ServiceAnnouncementRecord,
} from '../../service-announcements.ts'
import type { NusProviderConfig } from '../../../config.ts'
import {
  createNusBusProxyRequest,
  retryNusRequest,
  type NusAuthenticatedClient,
} from './client.ts'

/**
 * NUS ticker-tape service announcements.
 *
 * LIVE SOURCE (observed 2026-11-09 through the existing authenticated proxy): `POST
 * /univus/api/bus-proxy/ticker-tapes` with an empty extra body returns
 * `{ code: '00000', data: { TimeStamp, TickerTape: [...] } }`. Each record carries `Status`
 * (`Enabled` or `Disabled`), `Priority` (`High`/`Medium`/`Low`), `Affected_Service_Ids`
 * (comma-separated canonical route names, or empty for every service), `Message`, `Display_From`
 * and `Display_To` (offset ISO timestamps). The feed is historic — it returns hundreds of past
 * records — so the display window must be applied or long-expired notices would be announced.
 *
 * Fields NUSGo does not use (`Created_By`, `Created_On`, accident coordinates) are dropped here
 * rather than carried into the backend model.
 */

const NUS_TICKER_TAPE_ENDPOINT = 'ticker-tapes'
// The observed historic feed has 310 records. Reject oversized responses instead of retaining
// unbounded external messages in the process cache.
const MAX_TICKER_TAPE_RECORDS = 2_000
const MAX_MESSAGE_LENGTH = 4_096

const PRIORITY_BY_NORMALIZED_NAME: Readonly<Record<string, ServiceAnnouncementPriority>> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
}

interface RecordValue {
  readonly [key: string]: unknown
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(record: RecordValue, key: string): string | null {
  const value = record[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function timestampMs(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function priorityOf(value: string | null): ServiceAnnouncementPriority | null {
  if (!value) return null
  return PRIORITY_BY_NORMALIZED_NAME[value.toLowerCase()] ?? null
}

function splitServiceIds(value: string | null): readonly string[] {
  if (!value) return []
  return value
    .split(',')
    .map((routeId) => routeId.trim())
    .filter((routeId) => routeId.length > 0)
}

function parseRecord(value: unknown): ServiceAnnouncementRecord | null {
  if (!isRecord(value)) return null
  // Only `Enabled` records are live; an absent or unexpected status is not treated as enabled.
  if (text(value, 'Status')?.toLowerCase() !== 'enabled') return null

  const id = text(value, 'ID')
  const message = text(value, 'Message')
  const priority = priorityOf(text(value, 'Priority'))
  const displayFromMs = timestampMs(text(value, 'Display_From'))
  const displayToMs = timestampMs(text(value, 'Display_To'))
  if (!id || !message || !priority || displayFromMs === null || displayToMs === null) return null
  if (displayToMs <= displayFromMs) return null
  if (id.length > 128 || message.length > MAX_MESSAGE_LENGTH) return null
  // Only an explicitly empty string is global; missing or malformed audience data fails closed.
  if (typeof value.Affected_Service_Ids !== 'string' || value.Affected_Service_Ids.length > 1_024) return null

  const affectedServiceRouteIds = splitServiceIds(text(value, 'Affected_Service_Ids'))
  if (value.Affected_Service_Ids.trim().length > 0 && affectedServiceRouteIds.length === 0) return null

  return {
    id,
    message,
    priority,
    displayFromMs,
    displayToMs,
    affectedServiceRouteIds,
  }
}

/**
 * Validates the envelope and keeps only enabled, well-formed records.
 *
 * A malformed envelope is a failure, not an empty feed: replacing the last good announcements
 * with nothing would silently stop pushing a genuine notice.
 */
export function parseNusTickerTapeResponse(input: unknown): readonly ServiceAnnouncementRecord[] {
  if (!isRecord(input) || input.code !== '00000' || !isRecord(input.data) ||
      !Array.isArray(input.data.TickerTape) || input.data.TickerTape.length > MAX_TICKER_TAPE_RECORDS) {
    throw new Error('NUS ticker-tape response was invalid')
  }
  return input.data.TickerTape.flatMap((value) => {
    const record = parseRecord(value)
    return record ? [record] : []
  })
}

export interface NusServiceAnnouncementProvider {
  /** Fetches the ticker tape once; the caller applies its own cadence and single-flight. */
  load(signal: AbortSignal): Promise<readonly ServiceAnnouncementRecord[]>
}

interface NusServiceAnnouncementProviderOptions {
  readonly provider: NusProviderConfig
  readonly client: NusAuthenticatedClient
  readonly deviceId: string
  readonly retryAttempts: number
  readonly retryBaseDelayMs: number
}

export function createNusServiceAnnouncementProvider(
  options: NusServiceAnnouncementProviderOptions,
): NusServiceAnnouncementProvider {
  return {
    async load(signal) {
      const payload = await retryNusRequest(() => options.client.requestJson((session) => createNusBusProxyRequest(
        options.provider,
        session,
        options.deviceId,
        NUS_TICKER_TAPE_ENDPOINT,
        {},
      ), NUS_TICKER_TAPE_ENDPOINT, signal), signal, options.retryAttempts, options.retryBaseDelayMs)
      return parseNusTickerTapeResponse(payload)
    },
  }
}
