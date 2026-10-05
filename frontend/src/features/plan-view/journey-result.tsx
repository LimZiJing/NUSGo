import { useState, type CSSProperties } from 'react'
import type { TransitIndex } from '../../domain/transit'
import { formatSingaporeDateTime } from '../../domain/trip/journey-test-clock'
import type { Journey } from '../../domain/trip/journey'
import type { VenueLocationMap } from '../../domain/venue/types'
import { BusIcon, FootprintsIcon } from '../../ui/icons'
import {
  formatDistance,
  formatDuration,
  getJourneyTimelineEntries,
  type JourneyTimelineEntry,
} from './journey-result-presentation'

export type JourneyStatus = 'idle' | 'loading' | 'ready' | 'no-route' | 'failed'

export interface JourneyResultState {
  readonly status: JourneyStatus
  readonly journey: Journey | null
  readonly error: string | null
}

interface JourneyResultProps {
  readonly state: JourneyResultState
  readonly networkIndex: TransitIndex | null
  readonly venues: VenueLocationMap | null
  readonly simulated?: boolean
  readonly referenceTimeMs?: number | null
}

function renderShuttleLabel(entry: Extract<JourneyTimelineEntry, { kind: 'shuttle' }>) {
  const label = (
    <>
      <BusIcon className="journey-mode-icon journey-bus-icon" />
      <span>{entry.routeLabel}</span>
    </>
  )

  if (entry.stopLabels.length === 0) {
    return <span className="journey-route-chip">{label}</span>
  }

  return (
    <details className="journey-stop-disclosure">
      <summary className="journey-route-chip" aria-label={`${entry.routeLabel}, show bus stops`}>
        {label}
        <span className="journey-disclosure-chevron" aria-hidden="true" />
      </summary>
      <ol className="journey-stop-list" aria-label={`${entry.routeLabel} bus stops`}>
        {entry.stopLabels.map((stopLabel, stopIndex) => (
          <li key={`${entry.id}-stop-${stopIndex}`}>
            <span className="journey-stop-marker" aria-hidden="true" />
            <span>{stopLabel}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

function renderJourneyTimelineEntry(entry: JourneyTimelineEntry) {
  if (entry.kind === 'location') {
    return (
      <li className="journey-timeline-item journey-timeline-location" key={entry.id}>
        <span className="journey-timeline-marker" aria-hidden="true" />
        <strong>{entry.label}</strong>
      </li>
    )
  }

  if (entry.kind === 'walking') {
    return (
      <li className="journey-timeline-item journey-timeline-leg journey-timeline-walking" key={entry.id}>
        <span className="journey-timeline-marker" aria-hidden="true" />
        <div className="journey-timeline-content journey-walking-content">
          <strong className="journey-mode-label"><FootprintsIcon className="journey-mode-icon journey-walking-icon" />Walk</strong>
          <span className="journey-leg-summary">{entry.durationLabel} · {entry.distanceLabel}</span>
        </div>
      </li>
    )
  }

  return (
    <li
      className="journey-timeline-item journey-timeline-leg journey-timeline-shuttle"
      key={entry.id}
      style={entry.routeColor ? { '--journey-route-color': entry.routeColor } as CSSProperties : undefined}
    >
      <span className="journey-timeline-marker" aria-hidden="true" />
      <div className="journey-timeline-content journey-shuttle-content">
        {renderShuttleLabel(entry)}
        <span className="journey-leg-summary">{entry.waitLabel} · {entry.rideLabel}</span>
      </div>
    </li>
  )
}

function renderJourneyStatus(state: JourneyResultState) {
  if (state.status === 'loading') {
    return <p className="journey-status" role="status" aria-live="polite">Calculating recommended Journey…</p>
  }
  if (state.status === 'no-route') {
    return (
      <p className="journey-status" role="status" aria-live="polite">
        {state.error ?? 'No complete estimated Journey is available. Shuttle options may be excluded when timing data is missing.'}
      </p>
    )
  }
  if (state.status === 'failed') {
    return (
      <p className="journey-status" role="status" aria-live="polite">
        Journey calculation is unavailable right now. Please try again later.
      </p>
    )
  }
  return null
}

export function JourneyResult({
  state,
  networkIndex,
  venues,
  simulated = false,
  referenceTimeMs = null,
}: JourneyResultProps) {
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
      className="journey-result"
      aria-labelledby="journey-result-title"
      aria-live="polite"
    >
      <div className="journey-result-heading">
        <div className="journey-result-title">
          <h3 id="journey-result-title">Recommended</h3>
          <span className="journey-arrival">Arrive {arrivalTime}</span>
        </div>
        <div className="journey-metrics" aria-label="Journey estimate">
          <strong>{formatDuration(journey.totalDurationSeconds)}</strong>
          <span>{formatDistance(journey.totalDistanceMeters)}</span>
        </div>
      </div>
      {journeyNotice && (
        <p className="journey-notice" role="note">
          {journeyNotice}
        </p>
      )}
      <ol className="journey-timeline" aria-label="Journey details">
        {getJourneyTimelineEntries(journey, venues, networkIndex).map(renderJourneyTimelineEntry)}
      </ol>
    </section>
  )
}
