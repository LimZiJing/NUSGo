import { useState, type CSSProperties } from 'react'
import type { TransitIndex } from '../../domain/transit'
import { formatSingaporeDateTime } from '../../domain/trip/journey-test-clock'
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
  readonly referenceTimeMs?: number | null
}

function WalkingIcon() {
  return (
    <svg className="trip-journey-mode-icon trip-journey-walking-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5.4 17.6c-1.3-1.3-.7-3.7.9-5.2 1.7-1.5 3.9-1.7 4.8-.6 1 1.1.4 3.3-1.2 4.9-1.6 1.5-3.3 2.2-4.5.9Zm9.2-6.7c-1.3-1.3-.7-3.7.9-5.2 1.7-1.5 3.9-1.7 4.8-.6 1 1.1.4 3.3-1.2 4.9-1.6 1.5-3.3 2.2-4.5.9Z" />
    </svg>
  )
}

function BusIcon() {
  return (
    <svg className="trip-journey-mode-icon trip-journey-bus-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 17V7c0-1.2 1.8-2 6-2s6 .8 6 2v10M6 12h12M8 18l-1 2m9-2 1 2M7 17h10" />
      <circle cx="9" cy="15" r="1" />
      <circle cx="15" cy="15" r="1" />
    </svg>
  )
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
      <li className="trip-journey-timeline-item trip-journey-timeline-leg trip-journey-timeline-walking" key={entry.id}>
        <span className="trip-journey-timeline-marker" aria-hidden="true" />
        <div className="trip-journey-timeline-content">
          <strong className="trip-journey-mode-label"><WalkingIcon />Walk</strong>
          <span>{entry.durationLabel} · {entry.distanceLabel}</span>
        </div>
      </li>
    )
  }

  return (
    <li
      className="trip-journey-timeline-item trip-journey-timeline-leg trip-journey-timeline-shuttle"
      key={entry.id}
      style={entry.routeColor ? { '--journey-route-color': entry.routeColor } as CSSProperties : undefined}
    >
      <span className="trip-journey-timeline-marker" aria-hidden="true" />
      <div className="trip-journey-timeline-content">
        <strong className="trip-journey-route-chip">
          <BusIcon />
          {entry.routeLabel}
        </strong>
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
  referenceTimeMs = null,
}: TripJourneyResultProps) {
  const [fallbackReferenceTimeMs] = useState(() => Date.now())
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
  // Keep the timestamp tied to the planning reference instead of recalculating it from each render.
  const arrivalTime = formatSingaporeDateTime(
    Math.ceil(((referenceTimeMs ?? fallbackReferenceTimeMs) + journey.totalDurationSeconds * 1000) / 60000) * 60000,
  ).slice(11)
  return (
    <section
      className="trip-journey-result"
      aria-labelledby="trip-journey-result-title"
      aria-live="polite"
    >
      <div className="trip-journey-result-heading">
        <div className="trip-journey-result-title">
          <h3 id="trip-journey-result-title">Recommended</h3>
          <span className="trip-journey-arrival">Arrive {arrivalTime}</span>
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
