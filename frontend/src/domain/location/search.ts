import type { TransitIndex } from '../transit'
import type { TransitStop } from '@navus/shared/transit/types'
import type {
  TripEndpoint,
  TripLocationSearchResult,
} from '../trip/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { compareText, getMatchPriority, normalizeSearchText as normalize } from '../text-match'
import { getTripEndpointKey } from '../trip/endpoints'
import { EMPTY_BUILDING_INDEX, describeBuildingEntry, type BuildingIndex } from '../venue/building-index'

const MAX_RESULTS = 8

// Venue data holds rooms only, so bus stops and buildings, which stops are often named after,
// rank ahead of rooms.
const STOP_AND_BUILDING_ORDER = 0
const ROOM_ORDER = 1

interface SearchCandidate {
  result: TripLocationSearchResult
  fields: string[]
  kindOrder: number
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
  buildings: BuildingIndex = EMPTY_BUILDING_INDEX,
): string {
  if (endpoint.kind === 'current-location') return 'Current location'
  if (endpoint.kind === 'building') {
    const entry = buildings.byId.get(endpoint.id)
    if (entry) return entry.name
    const found = buildings.byPartId.get(endpoint.id)
    return found ? `${found.entry.name}${found.part.partLabel ? ` · ${found.part.partLabel}` : ''}` : endpoint.id
  }
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
  buildings: BuildingIndex = EMPTY_BUILDING_INDEX,
  kinds?: readonly TripEndpoint['kind'][],
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
      kindOrder: ROOM_ORDER,
    })
  }

  for (const stop of getStops(stops)) {
    candidates.push({
      result: {
        endpoint: { kind: 'stop', id: stop.id },
        label: stop.longName,
        // A short name that repeats the stop ID would print the code twice.
        detail: normalize(stop.shortName) === normalize(stop.id) ? '' : `${stop.shortName} (${stop.id})`,
      },
      fields: [stop.id, stop.longName, stop.shortName],
      kindOrder: STOP_AND_BUILDING_ORDER,
    })
  }

  for (const building of buildings.entries) {
    candidates.push({
      result: {
        endpoint: { kind: 'building', id: building.id },
        label: building.name,
        detail: describeBuildingEntry(building),
      },
      fields: [building.name, ...building.aliases, ...building.blocks.flatMap((block) => [`Block ${block}`, `${building.name} Block ${block}`])],
      kindOrder: STOP_AND_BUILDING_ORDER,
    })
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      priority: getMatchPriority(candidate.fields, normalizedQuery),
    }))
    .filter((candidate): candidate is SearchCandidate & { priority: number } => candidate.priority !== null)
    // Filtering before the cap keeps a narrow chip from being starved by other kinds.
    .filter((candidate) => !kinds || kinds.includes(candidate.result.endpoint.kind))
    .sort((first, second) => {
      const kindDifference = first.kindOrder - second.kindOrder
      if (kindDifference !== 0) return kindDifference

      const priorityDifference = first.priority - second.priority
      if (priorityDifference !== 0) return priorityDifference

      return compareText(
        normalize(getTripEndpointKey(first.result.endpoint)),
        normalize(getTripEndpointKey(second.result.endpoint)),
      )
    })
    .slice(0, getResultLimit(limit))
    .map((candidate) => candidate.result)
}
