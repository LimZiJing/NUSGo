import { useMemo, useState, type KeyboardEvent } from 'react'
import { getTripEndpointLabel, searchTripLocations } from '../../domain/location/search'
import { getTripEndpointKey } from '../../domain/trip/endpoints'
import type { TransitIndex } from '../../domain/transit'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripLocationSearchResult,
} from '../../domain/trip/types'
import type { VenueLocationMap } from '../../domain/venue/types'
import { ScrollArea } from '../../ui/scroll-area'
import { SearchField } from '../../ui/search-field'
import { CircleDotIcon, CloseIcon, LocateIcon, MapPinIcon } from '../../ui/icons'

export interface OriginLocationRequestState {
  readonly status: 'idle' | 'requesting' | 'error'
  readonly error: string | null
}

interface PlanEndpointControlProps {
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
  originLocationRequest?: OriginLocationRequestState
  onUseCurrentLocation?: () => void
  onCancelOriginLocationRequest?: () => void
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
  return result.endpoint.kind === 'current-location'
    ? result.label
    : result.endpoint.id
}

export function PlanEndpointControl({
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
  originLocationRequest = { status: 'idle', error: null },
  onUseCurrentLocation,
  onCancelOriginLocationRequest,
}: PlanEndpointControlProps) {
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
  const isGettingCurrentLocation = originLocationRequest.status === 'requesting'
  const locationActionLabel = isGettingCurrentLocation
    ? 'Getting current location'
    : originLocationRequest.error
      ? 'Retry current location'
      : 'Use current location'
  const searchStatus = !hasLocationData
    ? `${roleLabel} search is waiting for location data to load.`
    : showResults
      ? `${results.length} ${roleLabel.toLocaleLowerCase()} location${results.length === 1 ? '' : 's'} found.`
      : endpoint
        ? endpoint.kind === 'current-location'
          ? `${roleLabel} set to ${endpointLabel}.`
          : `${roleLabel} set to ${endpointLabel} (${endpoint.id}).`
        : ''

  const clearEndpoint = (): void => {
    onCancelOriginLocationRequest?.()
    if (searchQuery.trim()) onSearchCancel?.()
    onSearchQueryChange('')
    if (endpoint) onClear()
  }

  return (
    <section
      className={`plan-endpoint-control plan-endpoint-control-${role}`}
      aria-labelledby={`${inputId}-label`}
    >
      <span className="plan-endpoint-marker" aria-hidden="true">
        {role === 'origin' ? <CircleDotIcon /> : <MapPinIcon />}
      </span>
      <div className="plan-endpoint-field">
        <label id={`${inputId}-label`} className="visually-hidden" htmlFor={inputId}>{roleLabel}</label>
        <div className="plan-endpoint-input-row">
          <SearchField
            id={inputId}
            value={inputValue}
            placeholder={role === 'origin' ? 'Choose starting point' : 'Choose destination'}
            onFocus={() => {
              onCancelOriginLocationRequest?.()
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
              onCancelOriginLocationRequest?.()
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
            aria-describedby={originLocationRequest.error ? `${statusId} ${locationStatusId}` : statusId}
          />
          <div className="plan-endpoint-actions">
            {role === 'origin' && onUseCurrentLocation && (
              <button
                type="button"
                className="plan-endpoint-location"
                onClick={onUseCurrentLocation}
                disabled={isGettingCurrentLocation}
                aria-label={locationActionLabel}
                aria-busy={isGettingCurrentLocation}
                title={locationActionLabel}
              >
                <LocateIcon />
              </button>
            )}
            {(endpoint || searchQuery) && (
              <button
                type="button"
                className="plan-endpoint-clear"
                onClick={clearEndpoint}
                aria-label={`Clear ${roleLabel.toLocaleLowerCase()}`}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </div>
        <p id={statusId} className="plan-endpoint-search-status visually-hidden" role="status" aria-live="polite">
          {searchStatus}
        </p>

        {role === 'origin' && originLocationRequest.error && (
          <p id={locationStatusId} className="plan-endpoint-location-status" role="status" aria-live="polite">
            {originLocationRequest.error}
          </p>
        )}

        {showResults && hasLocationData && (
          <ScrollArea className="plan-endpoint-results" role="group" aria-label={`${roleLabel} search results`}>
            {results.length > 0 ? (
              results.map((result) => (
                <button
                  className="plan-endpoint-result"
                  type="button"
                  key={getTripEndpointKey(result.endpoint)}
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
              <p className="plan-endpoint-empty">No matching venues or shuttle stops</p>
            )}
          </ScrollArea>
        )}
      </div>
    </section>
  )
}
