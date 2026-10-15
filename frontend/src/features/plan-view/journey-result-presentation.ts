import type { TransitIndex } from '../../domain/transit'
import type { Path, PathLeg, BusPathLeg } from '../../pathfinding/path'
import { formatDuration } from '../../domain/trip/duration-format'
import { getTripEndpointKey } from '../../domain/trip/endpoints'
import { getTripEndpointLabel } from '../../domain/location/search'
import type { VenueLocationMap } from '@navus/shared/venue/types'

export type JourneyTimelineEntry =
  | {
      readonly kind: 'location'
      readonly id: string
      readonly label: string
      readonly locationKind: PathLeg['from']['kind']
    }
  | {
      readonly kind: 'walking'
      readonly id: string
      readonly durationLabel: string
      readonly distanceLabel: string
    }
  | {
      readonly kind: 'shuttle'
      readonly id: string
      readonly routeLabel: string
      readonly routeColor: string | null
      readonly intermediateStops: readonly { readonly id: string; readonly label: string }[]
      readonly waitLabel: string
      readonly rideLabel: string
    }

export type JourneyModeSummarySegment =
  | { readonly kind: 'walking' }
  | {
      readonly kind: 'shuttle'
      readonly routeLabel: string
      readonly routeColor: string | null
    }

export interface JourneyCompactSummary {
  readonly walkingDurationLabel: string
  readonly modeSegments: readonly JourneyModeSummarySegment[]
}

export interface JourneyOptionHeader {
  readonly kind: 'recommended' | 'neutral'
  readonly label: string
  readonly qualifier?: string
}

interface JourneyRoutePresentation {
  readonly routeLabel: string
  readonly routeColor: string | null
}

function getEndpointLabel(
  endpoint: PathLeg['from'],
  venues: VenueLocationMap | null,
  networkIndex: TransitIndex | null,
): string {
  return getTripEndpointLabel(endpoint, venues ?? {}, networkIndex ?? [])
}

function getRouteName(routeId: string, networkIndex: TransitIndex | null): string {
  return networkIndex?.routeById.get(routeId)?.name ?? routeId
}

function getJourneyRoutePresentation(
  routeId: string,
  networkIndex: TransitIndex | null,
): JourneyRoutePresentation {
  const route = networkIndex?.routeById.get(routeId)
  return {
    routeLabel: route?.name ?? getRouteName(routeId, networkIndex),
    routeColor: route?.color ?? null,
  }
}

export function formatWaitDuration(seconds: number): string {
  const nonNegativeSeconds = Math.max(0, seconds)
  if (nonNegativeSeconds === 0) return 'Arriving now'
  if (nonNegativeSeconds < 60) return 'Arriving now'
  return formatDuration(nonNegativeSeconds)
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.0', '')} km`
}

function getShuttleIntermediateStops(
  leg: BusPathLeg,
  networkIndex: TransitIndex | null,
): readonly { readonly id: string; readonly label: string }[] {
  if (!networkIndex) return []
  const route = networkIndex.routeById.get(leg.routeId)
  if (!route) return []

  // Shuttles only ride forward; a loop Route repeats its first stop at the end.
  const boardingIndex = route.stopIds.indexOf(leg.boardingStopId)
  if (boardingIndex < 0) return []
  const alightingIndex = route.stopIds.indexOf(leg.alightingStopId, boardingIndex + 1)
  if (alightingIndex < 0) return []

  return route.stopIds.slice(boardingIndex, alightingIndex + 1)
    .slice(1, -1)
    .map((stopId) => ({
      id: stopId,
      label: networkIndex.stopById.get(stopId)?.shortName ?? stopId,
    }))
}

function getLegEntry(
  leg: PathLeg,
  legIndex: number,
  networkIndex: TransitIndex | null,
): JourneyTimelineEntry {
  if (leg.mode === 'walking') {
    return {
      kind: 'walking',
      id: `walking-${legIndex}`,
      durationLabel: formatDuration(leg.durationSeconds),
      distanceLabel: formatDistance(leg.distanceMeters),
    }
  }

  const shuttleLeg: BusPathLeg = leg
  const routePresentation = getJourneyRoutePresentation(shuttleLeg.routeId, networkIndex)
  return {
    kind: 'shuttle',
    id: `shuttle-${legIndex}`,
    routeLabel: routePresentation.routeLabel,
    // Route colors come from the validated transit index so the journey uses the same palette as the map.
    routeColor: routePresentation.routeColor,
    intermediateStops: getShuttleIntermediateStops(shuttleLeg, networkIndex),
    waitLabel: `Wait ${formatWaitDuration(shuttleLeg.waitingSeconds)}`,
    rideLabel: `Ride ${formatDuration(shuttleLeg.rideSeconds)}`,
  }
}

export function getJourneyCompactSummary(
  path: Path,
  networkIndex: TransitIndex | null,
): JourneyCompactSummary {
  const walkingDurationSeconds = path.legs.reduce((total, leg) => (
    total + (leg.mode === 'walking' ? leg.durationSeconds : 0)
  ), 0)
  const modeSegments = path.legs.map((leg): JourneyModeSummarySegment => {
    if (leg.mode === 'walking') return { kind: 'walking' }
    const routePresentation = getJourneyRoutePresentation(leg.routeId, networkIndex)
    return {
      kind: 'shuttle',
      routeLabel: routePresentation.routeLabel,
      routeColor: routePresentation.routeColor,
    }
  })

  return {
    walkingDurationLabel: formatDuration(walkingDurationSeconds),
    modeSegments,
  }
}

export function getJourneyOptionHeader(
  path: Path,
  optionIndex: number,
): JourneyOptionHeader {
  const shuttleLegCount = path.legs.filter((leg) => leg.mode === 'shuttle').length
  if (optionIndex === 0) {
    return {
      kind: 'recommended',
      label: 'Recommended',
      ...(shuttleLegCount === 0 ? { qualifier: 'Walking' } : {}),
    }
  }
  if (shuttleLegCount === 0) return { kind: 'neutral', label: 'Walking' }

  const transferCount = shuttleLegCount - 1
  return {
    kind: 'neutral',
    label: transferCount === 0
      ? 'Direct shuttle'
      : `${transferCount} transfer${transferCount === 1 ? '' : 's'}`,
  }
}

function sameEndpoint(left: PathLeg['from'], right: PathLeg['from']): boolean {
  return getTripEndpointKey(left) === getTripEndpointKey(right)
}

function getLocationEntry(
  endpoint: PathLeg['from'],
  id: string,
  venues: VenueLocationMap | null,
  networkIndex: TransitIndex | null,
): Extract<JourneyTimelineEntry, { kind: 'location' }> {
  return {
    kind: 'location',
    id,
    label: getEndpointLabel(endpoint, venues, networkIndex),
    locationKind: endpoint.kind,
  }
}

/*
 * Flattening the domain Journey here keeps the domain model presentation-agnostic
 * while ensuring each endpoint is rendered once in the feature's timeline.
 */
export function getJourneyTimelineEntries(
  path: Path,
  venues: VenueLocationMap | null,
  networkIndex: TransitIndex | null,
): readonly JourneyTimelineEntry[] {
  const entries: JourneyTimelineEntry[] = [
    getLocationEntry(path.origin, 'origin', venues, networkIndex),
  ]

  path.legs.forEach((leg, legIndex) => {
    entries.push(getLegEntry(leg, legIndex, networkIndex))
    entries.push(getLocationEntry(leg.to, `location-${legIndex}`, venues, networkIndex))
  })

  const lastLeg = path.legs[path.legs.length - 1]
  if (!lastLeg || !sameEndpoint(lastLeg.to, path.destination)) {
    entries.push(getLocationEntry(path.destination, 'destination', venues, networkIndex))
  }

  return entries
}
