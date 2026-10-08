import { useState, type CSSProperties } from 'react'
import type { TransitIndex } from '../../domain/transit'
import { formatSingaporeDateTime } from '../../domain/trip/journey-test-clock'
import type { Journey } from '../../domain/trip/journey'
import type { ScoredJourneyCandidate } from '../../domain/trip/planner'
import type { VenueLocationMap } from '../../domain/venue/types'
import { BuildingIcon, BusIcon, FootprintsIcon } from '../../ui/icons'
import {
  formatDistance,
  formatDuration,
  getJourneyTimelineEntries,
  type JourneyTimelineEntry,
} from './journey-result-presentation'
import { selectJourneysForDisplay } from './journey-candidate-selection'

export type JourneyStatus = 'idle' | 'loading' | 'ready' | 'no-route' | 'failed'

export interface JourneyResultState {
  readonly status: JourneyStatus
  readonly journey: Journey | null
  readonly candidates: readonly ScoredJourneyCandidate[]
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

  if (entry.intermediateStops.length === 0) {
    return <span className="journey-route-chip">{label}</span>
  }

  return (
    <details className="journey-stop-disclosure">
      <summary className="journey-route-chip" aria-label={`${entry.routeLabel}, show bus stops`}>
        {label}
        <span className="journey-disclosure-chevron" aria-hidden="true" />
      </summary>
      <ol className="journey-stop-list" aria-label={`${entry.routeLabel} bus stops`}>
        {entry.intermediateStops.map((stop) => (
          <li
            key={`${entry.id}-stop-${stop.id}`}
            aria-label={`${stop.label}, shuttle stop, code ${stop.id}`}
          >
            <span className="journey-stop-marker" aria-hidden="true" />
            <span className="journey-stop-name">
              <BusIcon className="location-identity-icon location-identity-icon--stop" />
              <span>{stop.label}</span>
            </span>
          </li>
        ))}
      </ol>
    </details>
  )
}

function renderJourneyTimelineEntry(entry: JourneyTimelineEntry) {
  if (entry.kind === 'location') {
    const identityKind = entry.locationKind === 'current-location' ? null : entry.locationKind
    const identityLabel = identityKind === 'venue'
      ? `${entry.label}, venue`
      : identityKind === 'stop'
        ? `${entry.label}, shuttle stop`
        : entry.label
    return (
      <li className="journey-timeline-item journey-timeline-location" key={entry.id}>
        <span className="journey-timeline-marker" aria-hidden="true" />
        <span className="journey-location-name">
          {identityKind === 'venue' && <BuildingIcon className="location-identity-icon location-identity-icon--venue" />}
          {identityKind === 'stop' && <BusIcon className="location-identity-icon location-identity-icon--stop" />}
          <strong aria-label={identityLabel}>{entry.label}</strong>
        </span>
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

  const candidates = selectJourneysForDisplay(state.candidates)
  if (candidates.length === 0) {
    return renderJourneyStatus({
      status: 'no-route',
      journey: null,
      candidates: [],
      error: null,
    })
  }

  return (
    <ol className="journey-results" aria-label="Journey options" aria-live="polite">
      {candidates.map(({ candidateKey, journey }, index) => {
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
        const titleId = `journey-result-title-${index + 1}`

        return (
          <li className="journey-results-item" key={candidateKey}>
            <section
              className="journey-result"
              aria-labelledby={titleId}
            >
              <div className="journey-result-heading">
                <div className="journey-result-title">
                  <h3 id={titleId}>{index === 0 ? 'Recommended' : `Alternative ${index + 1}`}</h3>
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
              <ol
                className="journey-timeline"
                aria-label={index === 0 ? 'Journey details' : `Journey ${index + 1} details`}
              >
                {getJourneyTimelineEntries(journey, venues, networkIndex).map(renderJourneyTimelineEntry)}
              </ol>
            </section>
          </li>
        )
      })}
    </ol>
  )
}
