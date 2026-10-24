import type { TransitIndex } from '../../../domain/transit'
import type { TripEndpoint, TripEndpointRole, TripRequest } from '../../../domain/trip/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import type { BuildingIndex } from '../../../domain/venue/building-index'
import { IconButton } from '../../../ui/button'
import { ArrowDownUpIcon, ArrowRightIcon, CircleDotIcon, LocateIcon, MapPinIcon, RefreshIcon } from '../../../ui/icons'
import { EndpointKindIcon } from './plan-endpoint-display'
import { getEndpointLabel } from './plan-endpoint-labels'

export interface OriginLocationRequestState {
  readonly status: 'idle' | 'requesting' | 'error'
  readonly error: string | null
}

interface PlanTripCardProps {
  tripRequest: TripRequest
  venues: VenueLocationMap | null
  buildings: BuildingIndex | null
  networkIndex: TransitIndex | null
  originLocationRequest: OriginLocationRequestState
  planning: boolean
  onOpenSearch: (role: TripEndpointRole) => void
  onSwap: () => void
  onPlanJourney: () => void
  onUseCurrentLocation?: () => void
}

const PROMPTS: Record<TripEndpointRole, string> = {
  origin: 'Choose start point',
  destination: 'Where to?',
}

const ROLE_LABELS: Record<TripEndpointRole, string> = {
  origin: 'Origin',
  destination: 'Destination',
}

// The resting trip: a two-line card whose lines each open the shared location search.
export function PlanTripCard({
  tripRequest,
  venues,
  buildings,
  networkIndex,
  originLocationRequest,
  planning,
  onOpenSearch,
  onSwap,
  onPlanJourney,
  onUseCurrentLocation,
}: PlanTripCardProps) {
  const { origin, destination } = tripRequest
  const locating = originLocationRequest.status === 'requesting'
  const locationActionLabel = locating
    ? 'Getting current location'
    : originLocationRequest.error
      ? 'Retry current location'
      : 'Use current location'

  const renderLine = (role: TripEndpointRole, endpoint: TripEndpoint | null) => {
    const label = endpoint ? getEndpointLabel(endpoint, venues, networkIndex, buildings) : null
    const roleLabel = ROLE_LABELS[role]
    return (
      <button
        type="button"
        className="plan-trip-line-main"
        onClick={() => onOpenSearch(role)}
        aria-label={label
          ? `${roleLabel}: ${label}. Change ${roleLabel.toLocaleLowerCase()}`
          : `Choose ${roleLabel.toLocaleLowerCase()}`}
      >
        <span className="plan-trip-line-icon" aria-hidden="true">
          {endpoint ? <EndpointKindIcon kind={endpoint.kind} /> : role === 'origin' ? <CircleDotIcon /> : <MapPinIcon />}
        </span>
        <span className="plan-trip-line-text" aria-hidden="true">
          {label ? (
            <>
              {role === 'origin' && <span className="plan-trip-line-prefix">From </span>}
              {label}
            </>
          ) : (
            <span className="plan-trip-line-placeholder">{PROMPTS[role]}</span>
          )}
        </span>
      </button>
    )
  }

  return (
    <section className="plan-trip-card" aria-label="Origin and destination">
      <div className="plan-trip-line plan-trip-line-origin">
        {renderLine('origin', origin)}
        {origin ? (
          <IconButton
            variant="plain"
            label="Swap origin and destination"
            title="Swap origin and destination"
            icon={<ArrowDownUpIcon />}
            onClick={onSwap}
            disabled={!destination}
          />
        ) : onUseCurrentLocation && (
          <IconButton
            variant="plain"
            className="plan-trip-locate"
            label={locationActionLabel}
            title={locationActionLabel}
            icon={originLocationRequest.error && !locating ? <RefreshIcon /> : <LocateIcon />}
            busy={locating}
            disabled={locating}
            onClick={onUseCurrentLocation}
          />
        )}
      </div>
      <div className="plan-trip-line plan-trip-line-destination">
        {renderLine('destination', destination)}
        <IconButton
          variant="primary"
          label="Get route"
          title="Get route"
          icon={<ArrowRightIcon />}
          onClick={onPlanJourney}
          disabled={planning}
        />
      </div>
      {originLocationRequest.error && !origin && (
        <p className="plan-trip-location-status" role="status" aria-live="polite">
          {originLocationRequest.error}
        </p>
      )}
    </section>
  )
}
