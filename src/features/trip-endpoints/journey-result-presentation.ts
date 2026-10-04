import type { TransitIndex } from '../../domain/transit'
import type { Journey, JourneyLeg, ShuttleJourneyLeg } from '../../domain/trip/journey'
import { getTripEndpointLabel } from '../../domain/location/search'
import type { VenueLocationMap } from '../../domain/venue/types'

export type JourneyTimelineEntry =
  | {
      readonly kind: 'location'
      readonly id: string
      readonly label: string
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
      readonly waitLabel: string
      readonly rideLabel: string
    }

function getEndpointLabel(
  endpoint: JourneyLeg['from'],
  venues: VenueLocationMap | null,
  networkIndex: TransitIndex | null,
): string {
  return getTripEndpointLabel(endpoint, venues ?? {}, networkIndex ?? [])
}

function getRouteName(routeId: string, networkIndex: TransitIndex | null): string {
  return networkIndex?.routeById.get(routeId)?.name ?? routeId
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.ceil(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`
}

export function formatWaitDuration(seconds: number): string {
  const nonNegativeSeconds = Math.max(0, seconds)
  if (nonNegativeSeconds === 0) return 'Arriving now'
  if (nonNegativeSeconds < 60) return 'Arriving soon'
  return formatDuration(nonNegativeSeconds)
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.0', '')} km`
}

function getLegEntry(
  leg: JourneyLeg,
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

  const shuttleLeg: ShuttleJourneyLeg = leg
  const route = networkIndex?.routeById.get(shuttleLeg.routeId)
  return {
    kind: 'shuttle',
    id: `shuttle-${legIndex}`,
    routeLabel: route?.name ?? getRouteName(shuttleLeg.routeId, networkIndex),
    // Route colors come from the validated transit index so the journey uses the same palette as the map.
    routeColor: route?.color ?? null,
    waitLabel: `Wait ${formatWaitDuration(shuttleLeg.waitingSeconds)}`,
    rideLabel: `Ride ${formatDuration(shuttleLeg.rideSeconds)}`,
  }
}

function sameEndpoint(left: JourneyLeg['from'], right: JourneyLeg['from']): boolean {
  return left.kind === right.kind && left.id === right.id
}

/*
 * Flattening the domain Journey here keeps the domain model presentation-agnostic
 * while ensuring each endpoint is rendered once in the feature's timeline.
 */
export function getJourneyTimelineEntries(
  journey: Journey,
  venues: VenueLocationMap | null,
  networkIndex: TransitIndex | null,
): readonly JourneyTimelineEntry[] {
  const entries: JourneyTimelineEntry[] = [
    {
      kind: 'location',
      id: 'origin',
      label: getEndpointLabel(journey.origin, venues, networkIndex),
    },
  ]

  journey.legs.forEach((leg, legIndex) => {
    entries.push(getLegEntry(leg, legIndex, networkIndex))
    entries.push({
      kind: 'location',
      id: `location-${legIndex}`,
      label: getEndpointLabel(leg.to, venues, networkIndex),
    })
  })

  const lastLeg = journey.legs[journey.legs.length - 1]
  if (!lastLeg || !sameEndpoint(lastLeg.to, journey.destination)) {
    entries.push({
      kind: 'location',
      id: 'destination',
      label: getEndpointLabel(journey.destination, venues, networkIndex),
    })
  }

  return entries
}
