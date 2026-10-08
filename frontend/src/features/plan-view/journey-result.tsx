import { useState, type CSSProperties } from 'react'
import type { TransitIndex } from '../../domain/transit'
import { formatDuration } from '../../domain/trip/duration-format'
import { formatSingaporeDateTime } from '../../domain/trip/journey-test-clock'
import type { Journey } from '../../domain/trip/journey'
import type { ScoredJourneyCandidate } from '../../domain/trip/planner'
import type { VenueLocationMap } from '../../domain/venue/types'
import { BuildingIcon, BusIcon, FootprintsIcon } from '../../ui/icons'
import { DisclosureChevron } from '../../ui/disclosure-chevron'
import {
  formatDistance,
  getJourneyCompactSummary,
  getJourneyTimelineEntries,
  type JourneyCompactSummary,
  type JourneyTimelineEntry,
} from './journey-result-presentation'
import { selectJourneysForDisplay } from './journey-candidate-selection'

export type JourneyStatus = 'idle' | 'loading' | 'ready' | 'no-route' | 'failed'

export interface JourneyResultState {
  readonly status: JourneyStatus
  readonly journey: Journey | null
  readonly candidates: readonly ScoredJourneyCandidate[]
  readonly displayedCandidates?: readonly ScoredJourneyCandidate[]
  readonly selectedCandidateKey?: string | null
  readonly error: string | null
}

interface JourneyResultProps {
  readonly state: JourneyResultState
  readonly networkIndex: TransitIndex | null
  readonly venues: VenueLocationMap | null
  readonly simulated?: boolean
  readonly referenceTimeMs?: number | null
  readonly onSelectCandidate?: (candidateKey: string) => void
}

function renderJourneyModeSummary(summary: JourneyCompactSummary) {
  const modeNames = summary.modeSegments.map((segment) => (
    segment.kind === 'walking' ? 'Walk' : `${segment.routeLabel} shuttle`
  ))

  return (
    <span
      className="journey-option-modes"
      role="img"
      aria-label={`Journey modes: ${modeNames.join(', ')}`}
    >
      {summary.modeSegments.map((segment, index) => segment.kind === 'walking'
        ? (
          <span className="journey-option-walking" key={`walking-${index}`}>
            <FootprintsIcon className="journey-mode-icon journey-walking-icon" aria-hidden="true" />
            <span>Walk</span>
          </span>
        )
        : (
          <span
            className="journey-option-shuttle"
            key={`shuttle-${index}`}
            style={segment.routeColor
              ? { '--journey-route-color': segment.routeColor } as CSSProperties
              : undefined}
          >
            <BusIcon className="journey-mode-icon journey-bus-icon" aria-hidden="true" />
            <span>{segment.routeLabel}</span>
          </span>
        ))}
    </span>
  )
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
  onSelectCandidate,
}: JourneyResultProps) {
  const [fallbackReferenceTimeMs] = useState(() => Date.now())
  if (state.status !== 'ready' || state.journey === null) {
    return renderJourneyStatus(state)
  }

  const candidates = state.displayedCandidates ?? selectJourneysForDisplay(state.candidates)
  if (candidates.length === 0) {
    return renderJourneyStatus({
      status: 'no-route',
      journey: null,
      candidates: [],
      error: null,
    })
  }
  const selectedCandidateKey = candidates.some(({ candidateKey }) => (
    candidateKey === state.selectedCandidateKey
  ))
    ? state.selectedCandidateKey!
    : candidates[0]!.candidateKey
  const journeyReferenceTimeMs = referenceTimeMs ?? fallbackReferenceTimeMs

  return (
    <ol className="journey-results" aria-label="Journey options" aria-live="polite">
      {candidates.map(({ candidateKey, journey }, index) => {
        const selected = candidateKey === selectedCandidateKey
        const hasShuttleLeg = journey.legs.some((leg) => leg.mode === 'shuttle')
        const planningNotice = journey.planningQuality === 'bounded'
          ? 'This is a valid route found within a short search budget. A faster route may exist.'
          : null
        // PlanView owns the detailed simulated-clock notice; keep this result notice from repeating it.
        const liveArrivalNotice = !simulated && hasShuttleLeg
          ? 'Live shuttle arrivals may be used when available.'
          : null
        const journeyNotice = [planningNotice, liveArrivalNotice].filter(Boolean).join(' ')
        // Keep the timestamp tied to the planning reference instead of recalculating it from each render.
        const departureTime = formatSingaporeDateTime(journeyReferenceTimeMs).slice(11)
        const arrivalTime = formatSingaporeDateTime(
          Math.ceil((journeyReferenceTimeMs + journey.totalDurationSeconds * 1000) / 60000) * 60000,
        ).slice(11)
        const titleId = `journey-option-summary-${index + 1}`
        const detailsId = `journey-option-details-${index + 1}`
        const summary = getJourneyCompactSummary(journey, networkIndex)

        return (
          <li className="journey-results-item" key={candidateKey}>
            <section
              className={`journey-result${selected ? ' journey-result-selected' : ''}`}
              aria-labelledby={titleId}
            >
              <h3 className="journey-result-heading">
                <button
                  id={titleId}
                  type="button"
                  className="journey-option-summary"
                  data-candidate-key={candidateKey}
                  aria-expanded={selected}
                  aria-current={selected ? 'true' : undefined}
                  aria-controls={detailsId}
                  onClick={() => onSelectCandidate?.(candidateKey)}
                >
                  <span className="journey-option-summary-topline">
                    <span className="journey-option-times">{departureTime} – {arrivalTime}</span>
                    <span className="journey-option-estimate">
                      <span className="journey-option-duration">{formatDuration(journey.totalDurationSeconds)}</span>
                      <DisclosureChevron expanded={selected} />
                    </span>
                  </span>
                  <span className="journey-option-summary-bottomline">
                    {renderJourneyModeSummary(summary)}
                    <span className="journey-option-walking-total">Walk {summary.walkingDurationLabel}</span>
                  </span>
                </button>
              </h3>
              <div
                id={detailsId}
                className="journey-result-details"
                aria-labelledby={titleId}
                hidden={!selected}
              >
                {selected && (
                  <>
                    <span className="journey-detail-distance">
                      Total distance {formatDistance(journey.totalDistanceMeters)}
                    </span>
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
                  </>
                )}
              </div>
            </section>
          </li>
        )
      })}
    </ol>
  )
}
