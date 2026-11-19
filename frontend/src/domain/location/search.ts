import type { TransitIndex } from '../transit'
import type { TransitStop } from '@nusgo/shared/transit/types'
import type {
  TripEndpoint,
  TripLocationSearchResult,
} from '../trip/types'
import type { PersonalWaypoint } from '../waypoints/personal/personal-waypoint'
import type { JourneyEndpoint } from '@nusgo/shared/routing/path'
import type { VenueMap } from '@nusgo/shared/venue/types'
import { compareText, getMatchPriority, normalizeSearchText as normalize } from '../text-match'
import { getTripEndpointKey } from '../trip/endpoints'
import { createPersonalWaypointTripEndpoint } from '../trip/personal-waypoint-endpoints'
import { EMPTY_BUILDING_INDEX, describeBuildingEntry, type BuildingIndex } from '../venue/building-index'
import { getVenueSearchFields, getVenueSearchPresentation } from '../venue/search'

const MAX_RESULTS = 8

// Stops and buildings rank ahead of rooms and named destinations.
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

function getPersonalWaypointSearchResult(waypoint: PersonalWaypoint): TripLocationSearchResult | null {
  const endpoint = createPersonalWaypointTripEndpoint(waypoint)
  if (!endpoint) return null
  return {
    kind: 'personal-waypoint',
    endpoint,
    label: waypoint.name,
    detail: waypoint.category,
  }
}

export function getPersonalWaypointSearchResults(
  waypoints: readonly PersonalWaypoint[],
): TripLocationSearchResult[] {
  return waypoints
    .map((waypoint) => getPersonalWaypointSearchResult(waypoint))
    .filter((result): result is TripLocationSearchResult => result !== null)
    .sort((first, second) => compareText(normalize(first.label), normalize(second.label)))
    .slice(0, MAX_RESULTS)
}

function getStop(source: TransitStopSource, id: string): TransitStop | undefined {
  return source === null ? undefined : 'stopById' in source ? source.stopById.get(id) : source.find((stop) => stop.id === id)
}

export function getTripEndpointLabel(
  endpoint: TripEndpoint | JourneyEndpoint,
  venues: VenueMap,
  stops: TransitStopSource,
  buildings: BuildingIndex = EMPTY_BUILDING_INDEX,
): string {
  if (endpoint.kind === 'current-location') return 'Current location'
  if (endpoint.kind === 'waypoint-coordinate') return 'Personal waypoint'
  if (endpoint.kind === 'personal-waypoint') return endpoint.label
  if (endpoint.kind === 'building') {
    const entry = buildings.byId.get(endpoint.id)
    if (entry) return entry.name
    const found = buildings.byPartId.get(endpoint.id)
    return found ? `${found.entry.name}${found.part.partLabel ? ` · ${found.part.partLabel}` : ''}` : endpoint.id
  }
  if (endpoint.kind === 'venue') {
    const venue = venues[endpoint.id]
    return venue?.kind === 'food' ? venue.name : venue?.kind === 'room' ? venue.roomName : endpoint.id
  }

  return getStop(stops, endpoint.id)?.longName ?? endpoint.id
}

export function searchTripLocations(
  venues: VenueMap,
  stops: TransitStopSource,
  query: string,
  limit = MAX_RESULTS,
  buildings: BuildingIndex = EMPTY_BUILDING_INDEX,
  kinds?: readonly TripLocationSearchResult['kind'][],
  personalWaypoints: readonly PersonalWaypoint[] = [],
): TripLocationSearchResult[] {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return []

  const candidates: SearchCandidate[] = []

  for (const [code, venue] of Object.entries(venues)) {
    // Endpoint markers require mappable venue coordinates.
    if (!venue.location) continue

    const presentation = getVenueSearchPresentation(code, venue)
    candidates.push({
      result: venue.kind === 'food'
        ? {
          kind: 'food',
          endpoint: { kind: 'venue', id: code },
          venue,
          label: presentation.title,
          detail: presentation.detail,
        }
        : {
          kind: 'room',
          endpoint: { kind: 'venue', id: code },
          venue,
          label: code,
          detail: presentation.detail,
        },
      fields: getVenueSearchFields(code, venue),
      kindOrder: ROOM_ORDER,
    })
  }

  for (const stop of getStops(stops)) {
    candidates.push({
      result: {
        kind: 'stop',
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
        kind: 'building',
        endpoint: { kind: 'building', id: building.id },
        label: building.name,
        detail: describeBuildingEntry(building),
      },
      fields: [building.name, ...building.aliases, ...building.blocks.flatMap((block) => [`Block ${block}`, `${building.name} Block ${block}`])],
      kindOrder: STOP_AND_BUILDING_ORDER,
    })
  }

  for (const waypoint of personalWaypoints) {
    const result = getPersonalWaypointSearchResult(waypoint)
    if (!result) continue
    candidates.push({
      result,
      fields: [waypoint.name, waypoint.category],
      kindOrder: ROOM_ORDER,
    })
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      priority: getMatchPriority(candidate.fields, normalizedQuery),
    }))
    .filter((candidate): candidate is SearchCandidate & { priority: number } => candidate.priority !== null)
    // Filtering before the cap keeps a narrow chip from being starved by other kinds.
    .filter((candidate) => !kinds || kinds.includes(candidate.result.kind))
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
