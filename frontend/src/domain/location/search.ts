import type { TransitIndex } from '../transit'
import type { TransitStop } from '@navus/shared/transit/types'
import type {
  TripEndpoint,
  TripLocationSearchResult,
} from '../trip/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { getTripEndpointKey } from '../trip/endpoints'

const MAX_RESULTS = 8

interface SearchCandidate {
  result: TripLocationSearchResult
  fields: string[]
  kindOrder: number
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function getMatchPriority(fields: string[], query: string): number | null {
  let priority: number | null = null

  for (const field of fields) {
    const normalizedField = normalize(field)
    const fieldPriority = normalizedField === query
      ? 0
      : normalizedField.startsWith(query)
        ? 1
        : normalizedField.includes(query)
          ? 2
          : null

    if (fieldPriority !== null && (priority === null || fieldPriority < priority)) {
      priority = fieldPriority
    }
  }

  return priority
}

function compareText(first: string, second: string): number {
  if (first < second) return -1
  if (first > second) return 1
  return 0
}

function getResultLimit(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_RESULTS
  return Math.max(0, Math.min(MAX_RESULTS, Math.floor(limit)))
}

type TransitStopSource = TransitIndex | readonly TransitStop[] | null

function getStops(source: TransitStopSource): readonly TransitStop[] {
  return source === null ? [] : 'stops' in source ? source.stops : source
}

function getStop(source: TransitStopSource, id: string): TransitStop | undefined {
  return source === null ? undefined : 'stopById' in source ? source.stopById.get(id) : source.find((stop) => stop.id === id)
}

export function getTripEndpointLabel(
  endpoint: TripEndpoint,
  venues: VenueLocationMap,
  stops: TransitStopSource,
): string {
  if (endpoint.kind === 'current-location') return 'Current location'
  if (endpoint.kind === 'venue') {
    return venues[endpoint.id]?.roomName ?? endpoint.id
  }

  return getStop(stops, endpoint.id)?.longName ?? endpoint.id
}

export function searchTripLocations(
  venues: VenueLocationMap,
  stops: TransitStopSource,
  query: string,
  limit = MAX_RESULTS,
): TripLocationSearchResult[] {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return []

  const candidates: SearchCandidate[] = []

  for (const [code, venue] of Object.entries(venues)) {
    // Endpoint markers require mappable venue coordinates.
    if (!venue.location) continue

    candidates.push({
      result: {
        endpoint: { kind: 'venue', id: code },
        label: code,
        detail: venue.roomName,
      },
      fields: [code, venue.roomName],
      kindOrder: 0,
    })
  }

  for (const stop of getStops(stops)) {
    candidates.push({
      result: {
        endpoint: { kind: 'stop', id: stop.id },
        label: stop.longName,
        detail: `${stop.shortName} (${stop.id})`,
      },
      fields: [stop.id, stop.longName, stop.shortName],
      kindOrder: 1,
    })
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      priority: getMatchPriority(candidate.fields, normalizedQuery),
    }))
    .filter((candidate): candidate is SearchCandidate & { priority: number } => candidate.priority !== null)
    .sort((first, second) => {
      const priorityDifference = first.priority - second.priority
      if (priorityDifference !== 0) return priorityDifference

      const kindDifference = first.kindOrder - second.kindOrder
      if (kindDifference !== 0) return kindDifference

      return compareText(
        normalize(getTripEndpointKey(first.result.endpoint)),
        normalize(getTripEndpointKey(second.result.endpoint)),
      )
    })
    .slice(0, getResultLimit(limit))
    .map((candidate) => candidate.result)
}
