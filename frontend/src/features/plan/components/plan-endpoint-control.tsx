import { useMemo, useState, type KeyboardEvent } from 'react'
import { getTripEndpointLabel, searchTripLocations } from '../../../domain/location/search'
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
import { ScrollArea } from '../../../ui/scroll-area'
import { SearchField } from '../../../ui/search-field'
import {
  BuildingIcon,
  RoomIcon,
  BusIcon,
  CircleDotIcon,
  CloseIcon,
  LocateIcon,
  MapPinIcon,
} from '../../../ui/icons'

export interface OriginLocationRequestState {
  readonly status: 'idle' | 'requesting' | 'error'
  readonly error: string | null
}

interface PlanEndpointControlProps {
  role: TripEndpointRole
  endpoint: TripEndpoint | null
  venues: VenueLocationMap | null
  buildings?: BuildingIndex | null
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
  buildings: BuildingIndex | null,
): string {
  return getTripEndpointLabel(endpoint, venues ?? {}, networkIndex ?? [], buildings ?? undefined)
}

function getResultLabel(result: TripLocationSearchResult): string {
  // A building's stable ID is a slug, so its name is the meaningful title.
  return result.endpoint.kind === 'current-location' || result.endpoint.kind === 'building'
    ? result.label
    : result.endpoint.id
}

function isSameText(first: string, second: string): boolean {
  return first.trim().toLocaleLowerCase() === second.trim().toLocaleLowerCase()
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

function getEndpointKindLabel(endpoint: TripEndpoint): string | null {
  if (endpoint.kind === 'venue') return 'venue'
  if (endpoint.kind === 'building') return 'building'
  if (endpoint.kind === 'stop') return 'bus stop'
  return null
}

function getResultIdentityLabel(result: TripLocationSearchResult): string {
  if (result.endpoint.kind === 'current-location') return 'Current location'
  const kindLabel = getEndpointKindLabel(result.endpoint)
  const stableId = result.endpoint.kind === 'stop' ? `, ${result.endpoint.id}` : ''
  return `${result.label}, ${kindLabel}${stableId}`
}

export function PlanEndpointControl({
  role,
  endpoint,
  venues,
  buildings = null,
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
  const hasLocationData = venues !== null || networkIndex !== null || buildings !== null
  const [editing, setEditing] = useState(endpoint === null)
  const results = useMemo(
    () => searchTripLocations(venues ?? {}, networkIndex ?? [], searchQuery, undefined, buildings ?? undefined),
    [searchQuery, networkIndex, venues, buildings],
  )
  const showResults = searchQuery.trim().length > 0
  const endpointLabel = endpoint ? getEndpointLabel(endpoint, venues, networkIndex, buildings) : ''
  const endpointKindLabel = endpoint ? getEndpointKindLabel(endpoint) : null
  const endpointIdentityKind = endpoint?.kind === 'venue' || endpoint?.kind === 'building' || endpoint?.kind === 'stop'
    ? endpoint.kind
    : null
  const inputValue = endpoint && !editing && !searchQuery ? endpointLabel : searchQuery
  const isGettingCurrentLocation = originLocationRequest.status === 'requesting'
  const locationActionLabel = isGettingCurrentLocation
    ? 'Getting current location'
    : originLocationRequest.error
      ? 'Retry current location'
      : 'Use current location'
  // Once the origin is a Current location, capturing it again adds nothing, so the action is hidden.
  const useCurrentLocation = role === 'origin' && endpoint?.kind !== 'current-location'
    ? onUseCurrentLocation
    : undefined
  const searchStatus = isGettingCurrentLocation
    ? 'Getting your location…'
    : !hasLocationData
    ? `${roleLabel} search is waiting for location data to load.`
    : showResults
        ? `${results.length} ${roleLabel.toLocaleLowerCase()} location${results.length === 1 ? '' : 's'} found.`
      : endpoint
        ? endpoint.kind === 'current-location'
          ? `${roleLabel} set to ${endpointLabel}.`
          : endpoint.kind === 'building'
            ? `${roleLabel} set to ${endpointLabel}, building.`
            : `${roleLabel} set to ${endpointLabel}, ${endpointKindLabel} (${endpoint.id}).`
        : ''

  const clearEndpoint = (): void => {
    onCancelOriginLocationRequest?.()
    if (searchQuery.trim()) onSearchCancel?.()
    onSearchQueryChange('')
    if (endpoint) onClear()
  }

  return (
    <section
      className={`plan-endpoint-control plan-endpoint-control-${role}${endpointIdentityKind ? ' plan-endpoint-control-has-identity' : ''}`}
      aria-labelledby={`${inputId}-label`}
    >
      <span className="plan-endpoint-marker" aria-hidden="true">
        {role === 'origin' ? <CircleDotIcon /> : <MapPinIcon />}
      </span>
      <div className="plan-endpoint-field">
        <label id={`${inputId}-label`} className="visually-hidden" htmlFor={inputId}>{roleLabel}</label>
        <div className="plan-endpoint-input-row">
          {endpointIdentityKind === 'venue' && (
            <RoomIcon className="plan-endpoint-selected-icon location-identity-icon location-identity-icon--venue" />
          )}
          {endpointIdentityKind === 'building' && (
            <BuildingIcon className="plan-endpoint-selected-icon location-identity-icon location-identity-icon--building" />
          )}
          {endpointIdentityKind === 'stop' && (
            <BusIcon className="plan-endpoint-selected-icon location-identity-icon location-identity-icon--stop" />
          )}
          <SearchField
            id={inputId}
            value={inputValue}
            placeholder={role === 'origin' ? 'Choose origin' : 'Choose destination'}
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
            {useCurrentLocation && (
              <IconButton
                variant="plain"
                label={locationActionLabel}
                title={locationActionLabel}
                icon={<LocateIcon />}
                busy={isGettingCurrentLocation}
                disabled={isGettingCurrentLocation}
                onClick={useCurrentLocation}
              />
            )}
            {(endpoint || searchQuery) && (
              <IconButton
                variant="plain"
                label={`Clear ${roleLabel.toLocaleLowerCase()}`}
                icon={<CloseIcon />}
                onClick={clearEndpoint}
              />
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
              results.map((result) => {
                const visibleLabel = getVisibleResultLabel(result)
                const visibleDetail = getVisibleResultDetail(result)
                return (
                <button
                  className="plan-endpoint-result"
                  type="button"
                  key={getTripEndpointKey(result.endpoint)}
                  onClick={() => {
                    onSearchResult?.()
                    onSelect(result.endpoint)
                  }}
                  aria-label={`Set ${roleLabel.toLocaleLowerCase()} to ${getResultIdentityLabel(result)}`}
                >
                  {result.endpoint.kind !== 'current-location' && (
                    <span className="plan-endpoint-result-identity">
                      {result.endpoint.kind === 'venue' && (
                        <RoomIcon className="location-identity-icon location-identity-icon--venue" />
                      )}
                      {result.endpoint.kind === 'building' && (
                        <BuildingIcon className="location-identity-icon location-identity-icon--building" />
                      )}
                      {result.endpoint.kind === 'stop' && (
                        <BusIcon className="location-identity-icon location-identity-icon--stop" />
                      )}
                      <strong>{getResultLabel(result)}</strong>
                    </span>
                  )}
                  {visibleLabel && <span>{visibleLabel}</span>}
                  {visibleDetail && <span>{visibleDetail}</span>}
                </button>
                )
              })
            ) : (
              <p className="plan-endpoint-empty">No matching venues or bus stops</p>
            )}
          </ScrollArea>
        )}
      </div>
    </section>
  )
}
