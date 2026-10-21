import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { searchTripLocations } from '../../../domain/location/search'
import { getTripEndpointKey } from '../../../domain/trip/endpoints'
import type { TransitIndex } from '../../../domain/transit'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripLocationSearchResult,
} from '../../../domain/trip/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import type { BuildingIndex } from '../../../domain/venue/building-index'
import { IconButton } from '../../../ui/button'
import { ArrowLeftIcon, CloseIcon, LocateIcon, RefreshIcon, SearchIcon } from '../../../ui/icons'
import { EndpointKindIcon } from './plan-endpoint-display'
import { getEndpointKindLabel } from './plan-endpoint-labels'
import type { OriginLocationRequestState } from './plan-trip-card'

type KindFilter = 'all' | 'venue' | 'building' | 'stop'
type ResultKind = Exclude<KindFilter, 'all'>

const FILTERS: readonly { readonly id: KindFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'venue', label: 'Rooms' },
  { id: 'building', label: 'Buildings' },
  { id: 'stop', label: 'Bus stops' },
]

const GROUPS: readonly { readonly kind: ResultKind; readonly heading: string }[] = [
  { kind: 'building', heading: 'Buildings' },
  { kind: 'venue', heading: 'Rooms' },
  { kind: 'stop', heading: 'Bus stops' },
]

interface PlanLocationSearchProps {
  role: TripEndpointRole
  venues: VenueLocationMap | null
  buildings?: BuildingIndex | null
  networkIndex: TransitIndex | null
  searchQuery: string
  /** The endpoint on the other end of the trip, kept in view as context. */
  otherEndpointLabel: string | null
  /** Shown while nothing is typed, such as favourite stops. */
  suggestions?: readonly TripLocationSearchResult[]
  onSearchQueryChange: (query: string) => void
  onSelect: (endpoint: TripEndpoint) => void
  onBack: () => void
  originLocationRequest?: OriginLocationRequestState
  onUseCurrentLocation?: () => void
}

function getRoleLabel(role: TripEndpointRole): string {
  return role === 'origin' ? 'Origin' : 'Destination'
}

function isSameText(first: string, second: string): boolean {
  return first.trim().toLocaleLowerCase() === second.trim().toLocaleLowerCase()
}

function getResultLabel(result: TripLocationSearchResult): string {
  // A building's stable ID is a slug, so its name is the meaningful title.
  return result.endpoint.kind === 'current-location' || result.endpoint.kind === 'building'
    ? result.label
    : result.endpoint.id
}

// Hides any subtitle text that only repeats the row title or label, such as a code shown twice.
function getVisibleResultLabel(result: TripLocationSearchResult): string | null {
  return isSameText(result.label, getResultLabel(result)) ? null : result.label
}

function getVisibleResultDetail(result: TripLocationSearchResult): string | null {
  if (!result.detail) return null
  const repeatsTitle = isSameText(result.detail, getResultLabel(result))
  const repeatsLabel = isSameText(result.detail, result.label)
  return repeatsTitle || repeatsLabel ? null : result.detail
}

function getResultIdentityLabel(result: TripLocationSearchResult): string {
  if (result.endpoint.kind === 'current-location') return 'Current location'
  const kindLabel = getEndpointKindLabel(result.endpoint)
  const stableId = result.endpoint.kind === 'stop' ? `, ${result.endpoint.id}` : ''
  return `${result.label}, ${kindLabel}${stableId}`
}

// Marks the typed text inside a title so the match is easy to spot.
function Highlighted({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLocaleLowerCase()
  const start = needle ? text.toLocaleLowerCase().indexOf(needle) : -1
  if (start < 0) return <>{text}</>
  const end = start + needle.length
  return (
    <>
      {text.slice(0, start)}
      <mark className="plan-search-match">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  )
}

export function PlanLocationSearch({
  role,
  venues,
  buildings = null,
  networkIndex,
  searchQuery,
  otherEndpointLabel,
  suggestions = [],
  onSearchQueryChange,
  onSelect,
  onBack,
  originLocationRequest = { status: 'idle', error: null },
  onUseCurrentLocation,
}: PlanLocationSearchProps) {
  const roleLabel = getRoleLabel(role)
  const inputId = `trip-${role}-search`
  const statusId = `trip-${role}-search-status`
  const [filter, setFilter] = useState<KindFilter>('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const hasLocationData = venues !== null || networkIndex !== null || buildings !== null
  const hasQuery = searchQuery.trim().length > 0
  const locating = originLocationRequest.status === 'requesting'

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(
    () => hasQuery
      ? searchTripLocations(
        venues ?? {},
        networkIndex ?? [],
        searchQuery,
        undefined,
        buildings ?? undefined,
        filter === 'all' ? undefined : [filter],
      )
      : suggestions.filter((result) => filter === 'all' || result.endpoint.kind === filter),
    [hasQuery, searchQuery, networkIndex, venues, buildings, filter, suggestions],
  )

  const groups = GROUPS
    .map((group) => ({ ...group, rows: results.filter((result) => result.endpoint.kind === group.kind) }))
    .filter((group) => group.rows.length > 0)
  const showHeadings = filter === 'all' && groups.length > 1

  const searchStatus = !hasLocationData
    ? `${roleLabel} search is waiting for location data to load.`
    : hasQuery
      ? `${results.length} ${roleLabel.toLocaleLowerCase()} location${results.length === 1 ? '' : 's'} found.`
      : ''

  const locationActionLabel = locating
    ? 'Getting current location'
    : originLocationRequest.error
      ? 'Retry current location'
      : 'Use current location'

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    if (hasQuery) onSearchQueryChange('')
    else onBack()
  }

  return (
    <section className="plan-location-search" aria-label={`${roleLabel} search`}>
      <div className="plan-search-header">
      <div className="plan-search-bar">
        <IconButton
          variant="plain"
          label={`Back from ${roleLabel.toLocaleLowerCase()} search`}
          icon={<ArrowLeftIcon />}
          onClick={onBack}
        />
        <label className="visually-hidden" htmlFor={inputId}>{roleLabel}</label>
        <SearchIcon className="plan-search-bar-icon" />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          className="plan-search-input"
          value={searchQuery}
          placeholder={role === 'origin' ? 'Search start point' : 'Search destination'}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          aria-describedby={statusId}
        />
        {hasQuery ? (
          <IconButton
            variant="plain"
            label={`Clear ${roleLabel.toLocaleLowerCase()} search`}
            icon={<CloseIcon />}
            onClick={() => {
              onSearchQueryChange('')
              inputRef.current?.focus()
            }}
          />
        ) : role === 'origin' && onUseCurrentLocation && (
          <IconButton
            variant="plain"
            label={locationActionLabel}
            title={locationActionLabel}
            icon={originLocationRequest.error && !locating ? <RefreshIcon /> : <LocateIcon />}
            busy={locating}
            disabled={locating}
            onClick={onUseCurrentLocation}
          />
        )}
      </div>
      <p id={statusId} className="visually-hidden" role="status" aria-live="polite">
        {searchStatus}
      </p>
      {role === 'origin' && originLocationRequest.error && (
        <p className="plan-trip-location-status" role="status" aria-live="polite">
          {originLocationRequest.error}
        </p>
      )}

      <div className="plan-search-filters" role="group" aria-label="Filter results">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="plan-search-chip"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      </div>

      {hasLocationData && (hasQuery || results.length > 0) && (
        <div className="plan-search-results" role="group" aria-label={`${roleLabel} search results`}>
          {results.length > 0 ? (
            groups.map((group) => (
              <Fragment key={group.kind}>
                {showHeadings && <h3 className="plan-search-heading">{group.heading}</h3>}
                {group.rows.map((result) => {
                  const visibleLabel = getVisibleResultLabel(result)
                  const visibleDetail = getVisibleResultDetail(result)
                  return (
                    <button
                      className="plan-search-result"
                      type="button"
                      key={getTripEndpointKey(result.endpoint)}
                      onClick={() => onSelect(result.endpoint)}
                      aria-label={`Set ${roleLabel.toLocaleLowerCase()} to ${getResultIdentityLabel(result)}`}
                    >
                      <span className="plan-search-result-icon" aria-hidden="true">
                        <EndpointKindIcon kind={result.endpoint.kind} />
                      </span>
                      <span className="plan-search-result-text">
                        <strong><Highlighted text={getResultLabel(result)} query={searchQuery} /></strong>
                        {visibleLabel && <span><Highlighted text={visibleLabel} query={searchQuery} /></span>}
                        {visibleDetail && <span>{visibleDetail}</span>}
                      </span>
                    </button>
                  )
                })}
              </Fragment>
            ))
          ) : (
            <div className="plan-search-empty">
              <p className="plan-search-empty-title">No matches for “{searchQuery.trim()}”</p>
              <p>Try a building, room or bus stop name.</p>
            </div>
          )}
        </div>
      )}

      {otherEndpointLabel && (
        <p className="plan-search-context">
          {role === 'origin' ? 'To' : 'From'}: {otherEndpointLabel}
        </p>
      )}
    </section>
  )
}
