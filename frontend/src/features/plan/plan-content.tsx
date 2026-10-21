import { useEffect, useRef, useState } from 'react'
import type { TransitIndex } from '../../domain/transit'
import type { TripEndpointRole, TripLocationSearchResult, TripRequest } from '../../domain/trip/types.ts'
import type { BuildingIndex } from '../../domain/venue/building-index'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { PlanTripCard, type OriginLocationRequestState } from './components/plan-trip-card.tsx'
import { PlanLocationSearch } from './components/plan-location-search.tsx'
import { getEndpointLabel } from './components/plan-endpoint-labels.ts'
import { JourneyResults, type JourneyResultsState } from './components/journey-results.tsx'
import { formatSingaporeDateTime } from '../../domain/trip/simulated-time.ts'
import type { PlanTripFormBindings } from './hooks/use-plan-trip-form.ts'
import './styles/plan-content.css'

interface PlanContentProps {
  tripRequest: TripRequest
  venues: VenueLocationMap | null
  buildings?: BuildingIndex | null
  networkIndex: TransitIndex | null
  form: PlanTripFormBindings
  /** Shown in the search before anything is typed, such as favourite stops. */
  searchSuggestions?: readonly TripLocationSearchResult[]
  onSearchFocus?: () => void
  onSearchCancel?: () => void
  onSearchResult?: () => void
  originLocationRequest?: OriginLocationRequestState
  onUseCurrentLocationForOrigin?: () => void
  onCancelOriginLocationRequest?: () => void
  onSelectJourneyOption?: (candidateKey: string) => void
  path?: JourneyResultsState
  simulatedAtMs?: number | null
}

const PLAN_CONTENT_PANEL_ID = 'plan-content-panel'

// The form hook owns editable state and validation; this component maps its bindings onto the UI.
export function PlanContent({
  tripRequest,
  venues,
  buildings = null,
  networkIndex,
  form,
  searchSuggestions,
  onSearchFocus,
  onSearchCancel,
  onSearchResult,
  originLocationRequest = { status: 'idle', error: null },
  onUseCurrentLocationForOrigin,
  onCancelOriginLocationRequest,
  onSelectJourneyOption,
  path = { status: 'idle', path: null, candidates: [], error: null },
  simulatedAtMs = null,
}: PlanContentProps) {
  // Only one endpoint is edited at a time; the search replaces the card until it is dismissed.
  const [searchRole, setSearchRole] = useState<TripEndpointRole | null>(null)
  const previousTripRequest = useRef(tripRequest)

  useEffect(() => {
    const previous = previousTripRequest.current
    previousTripRequest.current = tripRequest
    if (!searchRole) return
    // A new endpoint, chosen from a result or located, ends the search.
    if (tripRequest[searchRole] !== null && tripRequest[searchRole] !== previous[searchRole]) {
      setSearchRole(null)
      onSearchResult?.()
    }
  }, [tripRequest, searchRole, onSearchResult])

  const openSearch = (role: TripEndpointRole): void => {
    form.onSearchQueryChange(role, '')
    setSearchRole(role)
    onSearchFocus?.()
  }

  const closeSearch = (): void => {
    if (searchRole) form.onSearchQueryChange(searchRole, '')
    onCancelOriginLocationRequest?.()
    setSearchRole(null)
    onSearchCancel?.()
  }

  const otherRole: TripEndpointRole | null = searchRole === 'origin' ? 'destination' : searchRole === 'destination' ? 'origin' : null
  const otherEndpoint = otherRole ? tripRequest[otherRole] : null

  return (
    <div className="plan-content">
      <div
        id={PLAN_CONTENT_PANEL_ID}
        className={`navigation-panel-content navigation-panel-scroll-content plan-content-panel${searchRole ? '' : ' plan-content-panel-trip'}`}
      >
        <h2 className="visually-hidden">Plan trip</h2>
        {searchRole ? (
          <PlanLocationSearch
            key={searchRole}
            role={searchRole}
            venues={venues}
            buildings={buildings}
            networkIndex={networkIndex}
            searchQuery={form.searchQueries[searchRole]}
            otherEndpointLabel={otherEndpoint ? getEndpointLabel(otherEndpoint, venues, networkIndex, buildings) : null}
            suggestions={searchSuggestions}
            onSearchQueryChange={(query) => form.onSearchQueryChange(searchRole, query)}
            onSelect={(endpoint) => form.onSelectEndpoint(searchRole, endpoint)}
            onBack={closeSearch}
            originLocationRequest={originLocationRequest}
            onUseCurrentLocation={onUseCurrentLocationForOrigin}
          />
        ) : (
          <div className="plan-trip-pin">
            <PlanTripCard
              tripRequest={tripRequest}
              venues={venues}
              buildings={buildings}
              networkIndex={networkIndex}
              originLocationRequest={originLocationRequest}
              planning={path.status === 'loading'}
              onOpenSearch={openSearch}
              onSwap={form.onSwap}
              onPlanJourney={form.onPlanJourney}
              onUseCurrentLocation={onUseCurrentLocationForOrigin}
            />
          </div>
        )}
        {!searchRole && (
          // On the mobile sheet only this region scrolls, so the trip card stays put above it.
          <div className="plan-results">
            {form.validationMessage && (
              <div className="plan-content-footer">
                <p className="plan-validation" role="status" aria-live="polite" aria-atomic="true">
                  {form.validationMessage}
                </p>
              </div>
            )}
            {simulatedAtMs !== null && (
              <p className="journey-notice" role="note">
                Simulated Journey at {formatSingaporeDateTime(simulatedAtMs).replace('T', ' ')} SGT.
                Each bus boarding uses a 5-minute test wait; these are not live arrivals.
              </p>
            )}
            <JourneyResults
              state={path}
              venues={venues}
              buildings={buildings}
              networkIndex={networkIndex}
              simulated={simulatedAtMs !== null}
              onSelectCandidate={onSelectJourneyOption}
            />
          </div>
        )}
      </div>
    </div>
  )
}
