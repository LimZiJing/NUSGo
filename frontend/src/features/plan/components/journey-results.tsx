import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { TransitIndex } from '../../../domain/transit'
import { formatDuration } from '../../../domain/trip/duration-format'
import type { Path } from '@nusgo/shared/routing/path'
import type { ScoredPathCandidate } from '@nusgo/shared/routing/path'
import type { BuildingIndex } from '../../../domain/venue/building-index'
import type { VenueLocationMap } from '@nusgo/shared/venue/types'
import { BuildingIcon, BusIcon, FootprintsIcon, RoomIcon } from '../../../ui/icons'
import { DisclosureChevron } from '../../../ui/disclosure-chevron'
import {
  getJourneyCompactSummary,
  getJourneyOptionDetail,
  getJourneyOptionHeader,
  getJourneyTimelineEntries,
  type JourneyCompactSummary,
  type JourneyTimelineEntry,
} from '../data/journey-display-data'
import { selectDisplayedJourneyOptions } from '../data/displayed-journey-options'

export type JourneyStatus = 'idle' | 'loading' | 'ready' | 'no-route' | 'failed'

export interface JourneyResultsState {
  readonly status: JourneyStatus
  readonly path: Path | null
  readonly candidates: readonly ScoredPathCandidate[]
  readonly displayedCandidates?: readonly ScoredPathCandidate[]
  readonly selectedCandidateKey?: string | null
  readonly error: string | null
}

interface JourneyResultsProps {
  readonly state: JourneyResultsState
  readonly networkIndex: TransitIndex | null
  readonly venues: VenueLocationMap | null
  readonly buildings?: BuildingIndex | null
  readonly onSelectCandidate?: (candidateKey: string) => void
  readonly onFitSelected?: () => void
}

function renderJourneyModeSummary(summary: JourneyCompactSummary) {
  const modeNames = summary.modeSegments.map((segment) => (
    segment.kind === 'walking' ? 'Walk' : `${segment.routeLabel} bus`
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
            className="journey-option-bus"
            key={`bus-${index}`}
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

function renderJourneyOptionHeader(path: Path, optionIndex: number) {
  const header = getJourneyOptionHeader(path, optionIndex)
  const headingClass = header.kind === 'recommended'
    ? 'journey-option-heading-recommended'
    : 'journey-option-heading-neutral'

  return (
    <span className="journey-option-heading-labels">
      <strong className={headingClass}>{header.label}</strong>
      {header.qualifier && (
        <span className="journey-option-heading-qualifier">{header.qualifier}</span>
      )}
    </span>
  )
}

function renderBusLabel(entry: Extract<JourneyTimelineEntry, { kind: 'bus' }>) {
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
            aria-label={`${stop.label}, bus stop, code ${stop.id}`}
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
      : identityKind === 'building'
        ? `${entry.label}, building`
        : identityKind === 'stop'
        ? `${entry.label}, bus stop`
        : entry.label
    return (
      <li className="journey-timeline-item journey-timeline-location" key={entry.id}>
        <span className="journey-timeline-marker" aria-hidden="true" />
        <span className="journey-location-name">
          {identityKind === 'venue' && <RoomIcon className="location-identity-icon location-identity-icon--venue" />}
          {identityKind === 'building' && <BuildingIcon className="location-identity-icon location-identity-icon--building" />}
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
      className="journey-timeline-item journey-timeline-leg journey-timeline-bus"
      key={entry.id}
      style={entry.routeColor ? { '--journey-route-color': entry.routeColor } as CSSProperties : undefined}
    >
      <span className="journey-timeline-marker" aria-hidden="true" />
      <div className="journey-timeline-content journey-bus-content">
        {renderBusLabel(entry)}
        <span className="journey-leg-summary">{entry.waitLabel} · {entry.rideLabel}</span>
      </div>
    </li>
  )
}

// The trip card above already names the two ends, so the timeline starts and ends on a leg.
function getJourneyLegEntries(
  path: Path,
  venues: VenueLocationMap | null,
  networkIndex: TransitIndex | null,
  buildings: BuildingIndex | null,
): readonly JourneyTimelineEntry[] {
  const entries = getJourneyTimelineEntries(path, venues, networkIndex, buildings)
  return entries.filter((entry, index) => (
    entry.kind !== 'location' || (index > 0 && index < entries.length - 1)
  ))
}

function renderJourneyStatus(state: JourneyResultsState) {
  if (state.status === 'loading') {
    return <p className="journey-status" role="status" aria-live="polite">Calculating recommended Journey…</p>
  }
  if (state.status === 'no-route') {
    return (
      <p className="journey-status" role="status" aria-live="polite">
        {state.error ?? 'No complete estimated Journey is available. Bus options may be excluded when timing data is missing.'}
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

export function JourneyResults({
  state,
  networkIndex,
  venues,
  buildings = null,
  onSelectCandidate,
  onFitSelected,
}: JourneyResultsProps) {
  const ready = state.status === 'ready' && state.path !== null
  const candidates = ready
    ? state.displayedCandidates ?? selectDisplayedJourneyOptions(state.candidates)
    : []
  const selectedKey = candidates.some(({ candidateKey }) => candidateKey === state.selectedCandidateKey)
    ? state.selectedCandidateKey!
    : candidates[0]?.candidateKey ?? null

  // Selection (map highlight) and expansion are separate: cards start collapsed.
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const previousSelectedKey = useRef(selectedKey)
  const candidateKeys = candidates.map(({ candidateKey }) => candidateKey).join('|')
  useEffect(() => {
    const previous = previousSelectedKey.current
    previousSelectedKey.current = selectedKey
    if (previous === null || !candidateKeys.split('|').includes(previous)) {
      // A new set of journeys: start collapsed again.
      setExpandedKey(null)
    } else if (selectedKey !== null && previous !== selectedKey) {
      // Choosing another journey (card or map marker) opens that card.
      setExpandedKey(selectedKey)
    }
  }, [selectedKey, candidateKeys])

  if (!ready) {
    return renderJourneyStatus(state)
  }

  if (candidates.length === 0) {
    return renderJourneyStatus({
      status: 'no-route',
      path: null,
      candidates: [],
      error: null,
    })
  }
  const selectedCandidateKey = selectedKey!
  return (
    <ol className="journey-results" aria-label="Journey options" aria-live="polite">
      {candidates.map(({ candidateKey, path }, index) => {
        const selected = candidateKey === selectedCandidateKey
        const expanded = candidateKey === expandedKey
        const titleId = `journey-option-summary-${index + 1}`
        const detailsId = `journey-option-details-${index + 1}`
        const summary = getJourneyCompactSummary(path, networkIndex)

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
                  aria-expanded={expanded}
                  aria-current={selected ? 'true' : undefined}
                  aria-controls={detailsId}
                  onClick={() => {
                    if (expanded) {
                      // Already open: the tap recentres the map on this route.
                      onFitSelected?.()
                      return
                    }
                    setExpandedKey(candidateKey)
                    onSelectCandidate?.(candidateKey)
                  }}
                >
                  <span className="journey-option-summary-topline">
                    <span className="journey-option-duration">{formatDuration(path.totalDurationSeconds)}</span>
                    <span className="journey-option-estimate">
                      {renderJourneyModeSummary(summary)}
                      <DisclosureChevron expanded={expanded} />
                    </span>
                  </span>
                  <span className="journey-option-summary-bottomline">
                    {renderJourneyOptionHeader(path, index)}
                    <span className="journey-option-detail">{getJourneyOptionDetail(path, summary)}</span>
                  </span>
                </button>
                {expanded && (
                  <button
                    type="button"
                    className="journey-option-collapse"
                    aria-label={`Collapse journey ${index + 1} details`}
                    onClick={() => setExpandedKey(null)}
                  />
                )}
              </h3>
              <div
                id={detailsId}
                className="journey-result-details"
                aria-labelledby={titleId}
                hidden={!expanded}
              >
                {expanded && (
                  <>
                    <ol
                      className="journey-timeline"
                      aria-label={index === 0 ? 'Journey details' : `Journey ${index + 1} details`}
                    >
                      {getJourneyLegEntries(path, venues, networkIndex, buildings).map(renderJourneyTimelineEntry)}
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
