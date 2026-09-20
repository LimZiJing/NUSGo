import { useEffect, useMemo, useRef, useState } from 'react'
import { validateTripRequest } from '../domain/trip/endpoints'
import { getTripEndpointLabel, searchTripLocations } from '../domain/location/search'
import type { TransitIndex } from '../domain/transit'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripLocationSearchResult,
  TripRequest,
} from '../domain/trip/types'
import type { VenueLocationMap } from '../domain/venue/types'

interface TripEndpointControlsProps {
  tripRequest: TripRequest
  venues: VenueLocationMap | null
  networkIndex: TransitIndex | null
  onSwap: () => void
  onSelectOriginEndpoint: (endpoint: TripEndpoint) => void
  onClearOriginEndpoint: () => void
  onSelectDestinationEndpoint: (endpoint: TripEndpoint) => void
  onClearDestinationEndpoint: () => void
  onClearTrip: () => void
}

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

export function TripEndpointControls({
  tripRequest,
  venues,
  networkIndex,
  onSwap,
  onSelectOriginEndpoint,
  onClearOriginEndpoint,
  onSelectDestinationEndpoint,
  onClearDestinationEndpoint,
  onClearTrip,
}: TripEndpointControlsProps) {
  const [searchQueries, setSearchQueries] = useState({
    origin: '',
    destination: '',
  })
  const tripValidation = validateTripRequest(tripRequest)
  const setSearchQuery = (role: TripEndpointRole, query: string): void => {
    setSearchQueries((current) => ({ ...current, [role]: query }))
  }
  const selectEndpoint = (role: TripEndpointRole, endpoint: TripEndpoint): void => {
    setSearchQuery(role, '')
    if (role === 'origin') onSelectOriginEndpoint(endpoint)
    else onSelectDestinationEndpoint(endpoint)
  }
  const clearTrip = (): void => {
    setSearchQueries({ origin: '', destination: '' })
    onClearTrip()
  }

  const previousTripRequest = useRef(tripRequest)
  const skipEndpointReset = useRef(false)
  const swapTripEndpoints = (): void => {
    skipEndpointReset.current = true
    onSwap()
  }

  useEffect(() => {
    const previous = previousTripRequest.current
    previousTripRequest.current = tripRequest
    if (skipEndpointReset.current) {
      skipEndpointReset.current = false
      return
    }
    const originSelected = tripRequest.origin !== null &&
      tripRequest.origin !== previous.origin
    const destinationSelected = tripRequest.destination !== null &&
      tripRequest.destination !== previous.destination
    if (!originSelected && !destinationSelected) return
    setSearchQueries((current) => ({
      origin: originSelected ? '' : current.origin,
      destination: destinationSelected ? '' : current.destination,
    }))
  }, [tripRequest])

  return (
    <section className="trip-controls" aria-label="Trip endpoints">
      <div className="trip-controls-heading">
        <h2>Trip endpoints</h2>
        <button
          type="button"
          onClick={swapTripEndpoints}
          disabled={!tripRequest.origin || !tripRequest.destination}
          aria-label="Swap origin and destination"
        >
          Swap
        </button>
      </div>
      <TripEndpointControl
        role="origin"
        endpoint={tripRequest.origin}
        venues={venues}
        networkIndex={networkIndex}
        searchQuery={searchQueries.origin}
        onSearchQueryChange={(query) => setSearchQuery('origin', query)}
        onSelect={(endpoint) => selectEndpoint('origin', endpoint)}
        onClear={onClearOriginEndpoint}
      />
      <TripEndpointControl
        role="destination"
        endpoint={tripRequest.destination}
        venues={venues}
        networkIndex={networkIndex}
        searchQuery={searchQueries.destination}
        onSearchQueryChange={(query) => setSearchQuery('destination', query)}
        onSelect={(endpoint) => selectEndpoint('destination', endpoint)}
        onClear={onClearDestinationEndpoint}
      />
      <button
        type="button"
        className="trip-clear-both"
        onClick={clearTrip}
        disabled={!tripRequest.origin && !tripRequest.destination}
      >
        Clear both endpoints
      </button>
      <p className="trip-validation" role="status" aria-live="polite" aria-atomic="true">
        {tripValidation ?? 'Origin and destination are set.'}
      </p>
    </section>
  )
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
        <div className="trip-endpoint-results" role="group" aria-label={`${roleLabel} search results`}>
          {results.length > 0 ? (
            results.map((result) => (
              <button
                className="trip-endpoint-result"
                type="button"
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
