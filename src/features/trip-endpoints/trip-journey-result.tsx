import type { TransitIndex } from '../../domain/transit'
import type { Journey, JourneyLeg, ShuttleJourneyLeg } from '../../domain/trip/journey'
import { getShuttleJourneyLegStopIds } from '../../domain/trip/journey-stops'
import { getTripEndpointLabel } from '../../domain/location/search'
import type { VenueLocationMap } from '../../domain/venue/types'

export type TripJourneyStatus = 'idle' | 'loading' | 'ready' | 'no-route' | 'failed'

export interface TripJourneyState {
  readonly status: TripJourneyStatus
  readonly journey: Journey | null
  readonly error: string | null
}

interface TripJourneyResultProps {
  readonly state: TripJourneyState
  readonly networkIndex: TransitIndex | null
  readonly venues: VenueLocationMap | null
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.ceil(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`
}

function formatWaitDuration(seconds: number): string {
  const nonNegativeSeconds = Math.max(0, seconds)
  if (nonNegativeSeconds === 0) return 'Arriving now'
  if (nonNegativeSeconds < 60) return 'Arriving soon'
  return formatDuration(nonNegativeSeconds)
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.0', '')} km`
}

function getStopLabel(
  stopId: string,
  networkIndex: TransitIndex | null,
): string {
  return networkIndex?.stopById.get(stopId)?.longName ?? stopId
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

function getTravelledStopLabels(
  leg: ShuttleJourneyLeg,
  networkIndex: TransitIndex | null,
): string[] {
  const route = networkIndex?.routeById.get(leg.routeId)
  const stopIds = getShuttleJourneyLegStopIds(leg, route ?? null)
  if (!stopIds) {
    return [
      getStopLabel(leg.boardingStopId, networkIndex),
      getStopLabel(leg.alightingStopId, networkIndex),
    ]
  }

  return stopIds.map((stopId) => getStopLabel(stopId, networkIndex))
}

function renderJourneyLeg(
  leg: JourneyLeg,
  legIndex: number,
  venues: VenueLocationMap | null,
  networkIndex: TransitIndex | null,
) {
  if (leg.mode === 'walking') {
    return (
      <li className="trip-journey-leg" key={`${leg.mode}-${legIndex}`}>
        <div className="trip-journey-leg-heading">
          <strong>Walk</strong>
          <span>{formatDuration(leg.durationSeconds)}</span>
        </div>
        <p>{formatDistance(leg.distanceMeters)}</p>
        <p className="trip-journey-leg-detail">
          {getEndpointLabel(leg.from, venues, networkIndex)} → {getEndpointLabel(leg.to, venues, networkIndex)}
        </p>
      </li>
    )
  }

  const travelledStops = getTravelledStopLabels(leg, networkIndex)
  return (
    <li className="trip-journey-leg" key={`${leg.mode}-${legIndex}`}>
      <div className="trip-journey-leg-heading">
        <strong>Shuttle {getRouteName(leg.routeId, networkIndex)}</strong>
        <span>{formatDuration(leg.durationSeconds)}</span>
      </div>
      <p>{formatDistance(leg.distanceMeters)}</p>
      <dl className="trip-journey-leg-details">
        <div>
          <dt>Wait</dt>
          <dd>{formatWaitDuration(leg.waitingSeconds)}</dd>
        </div>
        <div>
          <dt>Ride</dt>
          <dd>{formatDuration(leg.rideSeconds)}</dd>
        </div>
        <div>
          <dt>Board</dt>
          <dd>{getStopLabel(leg.boardingStopId, networkIndex)}</dd>
        </div>
        <div>
          <dt>Alight</dt>
          <dd>{getStopLabel(leg.alightingStopId, networkIndex)}</dd>
        </div>
      </dl>
      <p className="trip-journey-leg-detail">
        Stops: {travelledStops.join(' → ')}
      </p>
    </li>
  )
}

function renderJourneyStatus(state: TripJourneyState) {
  if (state.status === 'loading') {
    return <p className="trip-journey-status" role="status" aria-live="polite">Calculating recommended Journey…</p>
  }
  if (state.status === 'no-route') {
    return (
      <p className="trip-journey-status" role="status" aria-live="polite">
        {state.error ?? 'No complete estimated Journey is available. Shuttle options may be excluded when timing data is missing.'}
      </p>
    )
  }
  if (state.status === 'failed') {
    return (
      <p className="trip-journey-status" role="status" aria-live="polite">
        Journey calculation is unavailable right now. Please try again later.
      </p>
    )
  }
  return null
}

export function TripJourneyResult({
  state,
  networkIndex,
  venues,
}: TripJourneyResultProps) {
  if (state.status !== 'ready' || state.journey === null) {
    return renderJourneyStatus(state)
  }

  const journey: Journey = state.journey
  const hasShuttleLeg = journey.legs.some((leg) => leg.mode === 'shuttle')
  return (
    <section
      className="trip-journey-result"
      aria-labelledby="trip-journey-result-title"
      aria-live="polite"
    >
      <div className="trip-journey-result-heading">
        <div>
          <p className="trip-journey-kicker">Recommended journey</p>
          <h3 id="trip-journey-result-title">Fastest estimated Journey</h3>
        </div>
        <div className="trip-journey-metrics" aria-label="Journey estimate">
          <strong>{formatDuration(journey.totalDurationSeconds)}</strong>
          <span>{formatDistance(journey.totalDistanceMeters)}</span>
        </div>
      </div>
      <p className="trip-journey-notice" role="note">
        {hasShuttleLeg
          ? 'Live shuttle arrivals may be used when available. Waiting and ride times are estimates, not guaranteed arrival times.'
          : 'Travel times are estimates, not guaranteed arrival times.'}
      </p>
      <ol className="trip-journey-legs" aria-label="Journey legs">
        {journey.legs.map((leg, legIndex) => renderJourneyLeg(leg, legIndex, venues, networkIndex))}
      </ol>
    </section>
  )
}
