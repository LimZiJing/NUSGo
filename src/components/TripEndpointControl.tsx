import { useMemo } from 'react'
import { getTripEndpointLabel, searchTripLocations } from '../domain/location/search'
import type { TransitIndex } from '../domain/transit'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripLocationSearchResult,
} from '../domain/trip/types'
import type { VenueLocationMap } from '../domain/venue/types'

interface TripEndpointControlProps {
  role: TripEndpointRole
  endpoint: TripEndpoint | null
  venues: VenueLocationMap | null
  networkIndex: TransitIndex | null
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onSelect: (endpoint: TripEndpoint) => void
  onClear: () => void
}

function getRoleLabel(role: TripEndpointRole): string {
  return role === 'origin' ? 'Origin' : 'Destination'
}

function getEndpointLabel(
  endpoint: TripEndpoint,
  venues: VenueLocationMap | null,
  networkIndex: TransitIndex | null,
): string {
  return getTripEndpointLabel(endpoint, venues ?? {}, networkIndex ?? [])
}

function getResultLabel(result: TripLocationSearchResult): string {
  return result.endpoint.id
}

export function TripEndpointControl({
  role,
  endpoint,
  venues,
  networkIndex,
  searchQuery,
  onSearchQueryChange,
  onSelect,
  onClear,
}: TripEndpointControlProps) {
  const roleLabel = getRoleLabel(role)
  const inputId = `trip-${role}-search`
  const statusId = `trip-${role}-search-status`
  const hasLocationData = venues !== null || networkIndex !== null
  const results = useMemo(
    () => searchTripLocations(venues ?? {}, networkIndex ?? [], searchQuery),
    [searchQuery, networkIndex, venues],
  )
  const showResults = searchQuery.trim().length > 0
  const searchStatus = !hasLocationData
    ? `${roleLabel} search is waiting for location data to load.`
    : showResults
      ? `${results.length} ${roleLabel.toLocaleLowerCase()} location${results.length === 1 ? '' : 's'} found.`
      : 'Search venues and shuttle stops by code, name, or stop ID.'

  return (
    <section className="trip-endpoint-control" aria-labelledby={`${inputId}-label`}>
      <div className="trip-endpoint-heading">
        <label id={`${inputId}-label`} htmlFor={inputId}>{roleLabel}</label>
        <button
          type="button"
          className="trip-endpoint-clear"
          onClick={onClear}
          disabled={!endpoint}
          aria-label={`Clear ${roleLabel.toLocaleLowerCase()}`}
        >
          Clear
        </button>
      </div>

      <div className="trip-endpoint-search-row">
        <input
          id={inputId}
          type="search"
          value={searchQuery}
          placeholder={`Search ${roleLabel.toLocaleLowerCase()} venue or stop`}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          autoComplete="off"
          aria-describedby={statusId}
        />
        {searchQuery && (
          <button
            type="button"
            className="trip-endpoint-search-clear"
            onClick={() => onSearchQueryChange('')}
            aria-label={`Clear ${roleLabel.toLocaleLowerCase()} search`}
          >
            Clear
          </button>
        )}
      </div>

      <p className="trip-endpoint-selection">
        <span>Selected:</span>{' '}
        <strong>
          {endpoint
            ? getEndpointLabel(endpoint, venues, networkIndex)
            : `No ${roleLabel.toLocaleLowerCase()} selected`}
        </strong>
        {endpoint && <span className="trip-endpoint-id"> ({endpoint.id})</span>}
      </p>

      <p id={statusId} className="trip-endpoint-search-status" role="status" aria-live="polite">
        {searchStatus}
      </p>

      {showResults && hasLocationData && (
        <div className="trip-endpoint-results" role="listbox" aria-label={`${roleLabel} search results`}>
          {results.length > 0 ? (
            results.map((result) => (
              <button
                className="trip-endpoint-result"
                type="button"
                role="option"
                key={`${result.endpoint.kind}:${result.endpoint.id}`}
                onClick={() => onSelect(result.endpoint)}
                aria-label={`Set ${roleLabel.toLocaleLowerCase()} to ${getResultLabel(result)}`}
              >
                <strong>{getResultLabel(result)}</strong>
                <span>{result.label}</span>
                <span>{result.detail}</span>
              </button>
            ))
          ) : (
            <p className="trip-endpoint-empty">No matching venues or shuttle stops</p>
          )}
        </div>
      )}
    </section>
  )
}
