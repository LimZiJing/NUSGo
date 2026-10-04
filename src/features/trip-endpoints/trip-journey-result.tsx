import type { TransitIndex } from '../../domain/transit'
import type { Journey } from '../../domain/trip/journey'
import type { VenueLocationMap } from '../../domain/venue/types'
import {
  formatDistance,
  formatDuration,
  getJourneyTimelineEntries,
  type JourneyTimelineEntry,
} from './journey-result-presentation'

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
  readonly simulated?: boolean
}

function renderJourneyTimelineEntry(entry: JourneyTimelineEntry) {
  if (entry.kind === 'location') {
    return (
      <li className="trip-journey-timeline-item trip-journey-timeline-location" key={entry.id}>
        <span className="trip-journey-timeline-marker" aria-hidden="true" />
        <strong>{entry.label}</strong>
      </li>
    )
  }

  if (entry.kind === 'walking') {
    return (
      <li className="trip-journey-timeline-item trip-journey-timeline-leg" key={entry.id}>
        <span className="trip-journey-timeline-marker" aria-hidden="true" />
        <div className="trip-journey-timeline-content">
          <strong>Walk</strong>
          <span>{entry.durationLabel} · {entry.distanceLabel}</span>
        </div>
      </li>
    )
  }

  return (
    <li className="trip-journey-timeline-item trip-journey-timeline-leg" key={entry.id}>
      <span className="trip-journey-timeline-marker" aria-hidden="true" />
      <div className="trip-journey-timeline-content">
        <strong>{entry.routeLabel}</strong>
        <span>{entry.waitLabel} · {entry.rideLabel}</span>
      </div>
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
  simulated = false,
}: TripJourneyResultProps) {
  if (state.status !== 'ready' || state.journey === null) {
    return renderJourneyStatus(state)
  }

  const journey: Journey = state.journey
  const hasShuttleLeg = journey.legs.some((leg) => leg.mode === 'shuttle')
  const planningNotice = journey.planningQuality === 'bounded'
    ? 'This is a valid route found within a short search budget. A faster route may exist.'
    : null
  // PlanView owns the detailed simulated-clock notice; keep this result notice from repeating it.
  const timingNotice = simulated
    ? null
    : hasShuttleLeg
      ? 'Live shuttle arrivals may be used when available. Waiting and ride times are estimates, not guaranteed arrival times.'
      : 'Travel times are estimates, not guaranteed arrival times.'
  const journeyNotice = [planningNotice, timingNotice].filter(Boolean).join(' ')
  return (
    <section
      className="trip-journey-result"
      aria-labelledby="trip-journey-result-title"
      aria-live="polite"
    >
      <div className="trip-journey-result-heading">
        <div>
          <h3 id="trip-journey-result-title">Recommended Journey</h3>
        </div>
        <div className="trip-journey-metrics" aria-label="Journey estimate">
          <strong>{formatDuration(journey.totalDurationSeconds)}</strong>
          <span>{formatDistance(journey.totalDistanceMeters)}</span>
        </div>
      </div>
      {journeyNotice && (
        <p className="trip-journey-notice" role="note">
          {journeyNotice}
        </p>
      )}
      <ol className="trip-journey-timeline" aria-label="Journey details">
        {getJourneyTimelineEntries(journey, venues, networkIndex).map(renderJourneyTimelineEntry)}
      </ol>
    </section>
  )
}
