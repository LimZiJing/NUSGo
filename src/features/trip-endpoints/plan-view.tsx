import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { validateTripRequest } from '../../domain/trip/endpoints'
import { getTripEndpointLabel, searchTripLocations } from '../../domain/location/search'
import type { TransitIndex } from '../../domain/transit'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripLocationSearchResult,
  TripRequest,
} from '../../domain/trip/types'
import type { VenueLocationMap } from '../../domain/venue/types'
import { ScrollArea } from '../../ui/scroll-area'
import { SearchField } from '../../ui/search-field'
import { getTripPlanSummary } from './trip-summary'
import { TripJourneyResult, type TripJourneyState } from './trip-journey-result'
import { formatSingaporeDateTime } from '../../domain/trip/journey-test-clock'

interface PlanViewProps {
  tripRequest: TripRequest
  venues: VenueLocationMap | null
  networkIndex: TransitIndex | null
  expanded?: boolean
  onSearchFocus?: () => void
  onSearchCancel?: () => void
  onSearchResult?: () => void
  onSwap: () => void
  onSelectOriginEndpoint: (endpoint: TripEndpoint) => void
  onClearOriginEndpoint: () => void
  onSelectDestinationEndpoint: (endpoint: TripEndpoint) => void
  onClearDestinationEndpoint: () => void
  onClearTrip: () => void
  onPlanJourney: () => void
  originVenueAutofill?: OriginVenueAutofillState
  onUseCurrentLocationForOrigin?: () => void
  onCancelOriginVenueAutofill?: () => void
  journey?: TripJourneyState
  simulatedAtMs?: number | null
}

interface OriginVenueAutofillState {
  readonly status: 'idle' | 'requesting' | 'error'
  readonly error: string | null
}

interface TripEndpointControlProps {
  role: TripEndpointRole
  endpoint: TripEndpoint | null
  venues: VenueLocationMap | null
  networkIndex: TransitIndex | null
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onSearchFocus?: () => void
  onSearchCancel?: () => void
  onSearchResult?: () => void
  onSelect: (endpoint: TripEndpoint) => void
  onClear: () => void
  originVenueAutofill?: OriginVenueAutofillState
  onUseCurrentLocation?: () => void
  onCancelOriginVenueAutofill?: () => void
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

const TRIP_CONTROLS_CONTENT_ID = 'trip-controls-panel-content'

export function PlanView({
  tripRequest,
  venues,
  networkIndex,
  expanded,
  onSearchFocus,
  onSearchCancel,
  onSearchResult,
  onSwap,
  onSelectOriginEndpoint,
  onClearOriginEndpoint,
  onSelectDestinationEndpoint,
  onClearDestinationEndpoint,
  onClearTrip,
  onPlanJourney,
  originVenueAutofill = { status: 'idle', error: null },
  onUseCurrentLocationForOrigin,
  onCancelOriginVenueAutofill,
  journey = { status: 'idle', journey: null, error: null },
  simulatedAtMs = null,
}: PlanViewProps) {
  const isExpanded = expanded ?? true
  const [searchQueries, setSearchQueries] = useState({
    origin: '',
    destination: '',
  })
  const [journeyReferenceTimeMs, setJourneyReferenceTimeMs] = useState<number | null>(null)
  const tripValidation = validateTripRequest(tripRequest)
  const setSearchQuery = (role: TripEndpointRole, query: string): void => {
    if (role === 'origin') onCancelOriginVenueAutofill?.()
    setSearchQueries((current) => ({ ...current, [role]: query }))
  }
  const selectEndpoint = (role: TripEndpointRole, endpoint: TripEndpoint): void => {
    setSearchQuery(role, '')
    if (role === 'origin') onSelectOriginEndpoint(endpoint)
    else onSelectDestinationEndpoint(endpoint)
  }
  const clearTrip = (): void => {
    setSearchQueries({ origin: '', destination: '' })
    setJourneyReferenceTimeMs(null)
    onClearTrip()
  }
  const planJourney = (): void => {
    setJourneyReferenceTimeMs(Date.now())
    onPlanJourney()
  }

  const previousTripRequest = useRef(tripRequest)
  const skipEndpointReset = useRef(false)
  const swapTripEndpoints = (): void => {
    skipEndpointReset.current = true
    onSwap()
  }

  const tripSummary = getTripPlanSummary(tripRequest, venues, networkIndex)

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
    <>
      <div className="trip-controls-heading">
        <div className="trip-controls-title">
          <h2>Plan trip</h2>
          <span className="trip-controls-summary" title={tripSummary.visible}>
            {tripSummary.visible}
          </span>
        </div>
        <button
          type="button"
          className="trip-controls-swap"
          onClick={swapTripEndpoints}
          disabled={!tripRequest.origin || !tripRequest.destination}
          aria-label="Swap origin and destination"
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d="M7 5v14m0 0-4-4m4 4 4-4M17 19V5m0 0-4 4m4-4 4 4" />
          </svg>
        </button>
      </div>
      <div
        id={TRIP_CONTROLS_CONTENT_ID}
        className="trip-controls-body"
        data-expanded={isExpanded}
        data-mobile-sheet-content
      >
        <div className="trip-endpoint-picker">
          <TripEndpointControl
            key={`origin:${tripRequest.origin?.kind ?? 'none'}:${tripRequest.origin?.id ?? 'none'}`}
            role="origin"
            endpoint={tripRequest.origin}
            venues={venues}
            networkIndex={networkIndex}
            searchQuery={searchQueries.origin}
            onSearchQueryChange={(query) => setSearchQuery('origin', query)}
            onSearchFocus={onSearchFocus}
            onSearchCancel={onSearchCancel}
            onSearchResult={onSearchResult}
            onSelect={(endpoint) => selectEndpoint('origin', endpoint)}
            onClear={onClearOriginEndpoint}
            originVenueAutofill={originVenueAutofill}
            onUseCurrentLocation={onUseCurrentLocationForOrigin}
            onCancelOriginVenueAutofill={onCancelOriginVenueAutofill}
          />
          <TripEndpointControl
            key={`destination:${tripRequest.destination?.kind ?? 'none'}:${tripRequest.destination?.id ?? 'none'}`}
            role="destination"
            endpoint={tripRequest.destination}
            venues={venues}
            networkIndex={networkIndex}
            searchQuery={searchQueries.destination}
            onSearchQueryChange={(query) => setSearchQuery('destination', query)}
            onSearchFocus={onSearchFocus}
            onSearchCancel={onSearchCancel}
            onSearchResult={onSearchResult}
            onSelect={(endpoint) => selectEndpoint('destination', endpoint)}
            onClear={onClearDestinationEndpoint}
          />
        </div>
        <div className="trip-controls-footer">
          {tripValidation && (
            <p className="trip-validation" role="status" aria-live="polite" aria-atomic="true">
              {tripValidation}
            </p>
          )}
          <div className="trip-controls-actions">
            <button
              type="button"
              className="trip-clear-both"
              onClick={clearTrip}
              disabled={!tripRequest.origin && !tripRequest.destination}
            >
              Clear all
            </button>
            <button
              type="button"
              className="trip-plan-submit"
              onClick={planJourney}
              disabled={tripValidation !== null || journey.status === 'loading'}
            >
              Get route
            </button>
          </div>
        </div>
        {simulatedAtMs !== null && (
          <p className="trip-journey-notice" role="note">
            Simulated Journey at {formatSingaporeDateTime(simulatedAtMs).replace('T', ' ')} SGT.
            Each shuttle boarding uses a 5-minute test wait; these are not live arrivals.
          </p>
        )}
        <TripJourneyResult
          state={journey}
          venues={venues}
          networkIndex={networkIndex}
          simulated={simulatedAtMs !== null}
          referenceTimeMs={simulatedAtMs ?? journeyReferenceTimeMs}
        />
      </div>
    </>
  )
}

export function TripEndpointControl({
  role,
  endpoint,
  venues,
  networkIndex,
  searchQuery,
  onSearchQueryChange,
  onSearchFocus,
  onSearchCancel,
  onSearchResult,
  onSelect,
  onClear,
  originVenueAutofill = { status: 'idle', error: null },
  onUseCurrentLocation,
  onCancelOriginVenueAutofill,
}: TripEndpointControlProps) {
  const roleLabel = getRoleLabel(role)
  const inputId = `trip-${role}-search`
  const statusId = `trip-${role}-search-status`
  const locationStatusId = `trip-${role}-location-status`
  const hasLocationData = venues !== null || networkIndex !== null
  const [editing, setEditing] = useState(endpoint === null)
  const results = useMemo(
    () => searchTripLocations(venues ?? {}, networkIndex ?? [], searchQuery),
    [searchQuery, networkIndex, venues],
  )
  const showResults = searchQuery.trim().length > 0
  const endpointLabel = endpoint ? getEndpointLabel(endpoint, venues, networkIndex) : ''
  const inputValue = endpoint && !editing && !searchQuery ? endpointLabel : searchQuery
  const isFindingNearestVenue = originVenueAutofill.status === 'requesting'
  const locationActionLabel = isFindingNearestVenue
    ? 'Finding nearest venue'
    : originVenueAutofill.error
      ? 'Retry nearest venue'
      : 'Use current location'
  const searchStatus = !hasLocationData
    ? `${roleLabel} search is waiting for location data to load.`
    : showResults
      ? `${results.length} ${roleLabel.toLocaleLowerCase()} location${results.length === 1 ? '' : 's'} found.`
      : endpoint
        ? `${roleLabel} set to ${endpointLabel} (${endpoint.id}).`
        : ''

  const clearEndpoint = (): void => {
    onCancelOriginVenueAutofill?.()
    if (searchQuery.trim()) onSearchCancel?.()
    onSearchQueryChange('')
    if (endpoint) onClear()
  }

  return (
    <section
      className={`trip-endpoint-control trip-endpoint-control-${role}`}
      aria-labelledby={`${inputId}-label`}
    >
      <span className="trip-endpoint-marker" aria-hidden="true" />
      <div className="trip-endpoint-field">
        <label id={`${inputId}-label`} className="visually-hidden" htmlFor={inputId}>{roleLabel}</label>
        <div className="trip-endpoint-input-row">
          <SearchField
            id={inputId}
            value={inputValue}
            placeholder={role === 'origin' ? 'Choose starting point' : 'Choose destination'}
            onFocus={() => {
              onCancelOriginVenueAutofill?.()
              if (endpoint && !editing) {
                setEditing(true)
                onSearchQueryChange('')
              }
              onSearchFocus?.()
            }}
            onBlur={() => {
              if (endpoint && !searchQuery) setEditing(false)
            }}
            onChange={(event) => {
              onCancelOriginVenueAutofill?.()
              setEditing(true)
              onSearchQueryChange(event.target.value)
            }}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key !== 'Escape') return
              if (!searchQuery && endpoint && editing) {
                event.preventDefault()
                event.stopPropagation()
                setEditing(false)
                onSearchCancel?.()
                return
              }
              if (!searchQuery) {
                if (!onSearchCancel) return
                event.preventDefault()
                event.stopPropagation()
                onSearchCancel()
                return
              }
              event.preventDefault()
              event.stopPropagation()
              onSearchCancel?.()
              onSearchQueryChange('')
            }}
            autoComplete="off"
            aria-describedby={originVenueAutofill.error ? `${statusId} ${locationStatusId}` : statusId}
          />
          <div className="trip-endpoint-actions">
            {role === 'origin' && onUseCurrentLocation && (
              <button
                type="button"
                className="trip-endpoint-location"
                onClick={onUseCurrentLocation}
                disabled={isFindingNearestVenue}
                aria-label={locationActionLabel}
                aria-busy={isFindingNearestVenue}
                title={locationActionLabel}
              >
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <path d="M12 3v3m0 12v3M3 12h3m12 0h3" />
                  <circle cx="12" cy="12" r="5" />
                </svg>
              </button>
            )}
            {(endpoint || searchQuery) && (
              <button
                type="button"
                className="trip-endpoint-clear"
                onClick={clearEndpoint}
                aria-label={`Clear ${roleLabel.toLocaleLowerCase()}`}
              >
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <p id={statusId} className="trip-endpoint-search-status visually-hidden" role="status" aria-live="polite">
          {searchStatus}
        </p>

        {role === 'origin' && originVenueAutofill.error && (
          <p id={locationStatusId} className="trip-endpoint-location-status" role="status" aria-live="polite">
            {originVenueAutofill.error}
          </p>
        )}

        {showResults && hasLocationData && (
          <ScrollArea className="trip-endpoint-results" role="group" aria-label={`${roleLabel} search results`}>
            {results.length > 0 ? (
              results.map((result) => (
                <button
                  className="trip-endpoint-result"
                  type="button"
                  key={`${result.endpoint.kind}:${result.endpoint.id}`}
                  onClick={() => {
                    onSearchResult?.()
                    onSelect(result.endpoint)
                  }}
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
          </ScrollArea>
        )}
      </div>
    </section>
  )
}
