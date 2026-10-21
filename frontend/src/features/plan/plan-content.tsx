import { getTripEndpointKey } from '../../domain/trip/endpoints.ts'
import type { TransitIndex } from '../../domain/transit'
import type { TripRequest } from '../../domain/trip/types.ts'
import type { BuildingIndex } from '../../domain/venue/building-index'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { PlanEndpointControl, type OriginLocationRequestState } from './components/plan-endpoint-control.tsx'
import { JourneyResults, type JourneyResultsState } from './components/journey-results.tsx'
import { TripActionsMenu } from './components/trip-actions-menu.tsx'
import { formatSingaporeDateTime } from '../../domain/trip/simulated-time.ts'
import { ArrowDownUpIcon, ArrowRightIcon } from '../../ui/icons'
import { IconButton } from '../../ui/button.tsx'
import type { PlanTripFormBindings } from './hooks/use-plan-trip-form.ts'
import './styles/plan-content.css'

interface PlanContentProps {
  tripRequest: TripRequest
  venues: VenueLocationMap | null
  buildings?: BuildingIndex | null
  networkIndex: TransitIndex | null
  form: PlanTripFormBindings
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
  return (
    <div className="plan-content">
      <div className="plan-content-heading">
        <div className="plan-content-title">
          <h2>Plan trip</h2>
        </div>
        <TripActionsMenu
          disabled={!tripRequest.origin && !tripRequest.destination}
          onClear={form.onClearTrip}
        />
      </div>
      <div
        id={PLAN_CONTENT_PANEL_ID}
        className="navigation-panel-content navigation-panel-scroll-content plan-content-panel"
      >
        <div className="plan-endpoint-picker">
          <div className="plan-endpoint-rows">
            <PlanEndpointControl
              key={`origin:${tripRequest.origin ? getTripEndpointKey(tripRequest.origin) : 'none'}`}
              role="origin"
              endpoint={tripRequest.origin}
              venues={venues}
              buildings={buildings}
              networkIndex={networkIndex}
              searchQuery={form.searchQueries.origin}
              onSearchQueryChange={(query) => form.onSearchQueryChange('origin', query)}
              onSearchFocus={onSearchFocus}
              onSearchCancel={onSearchCancel}
              onSearchResult={onSearchResult}
              onSelect={(endpoint) => form.onSelectEndpoint('origin', endpoint)}
              onClear={form.onClearOriginEndpoint}
              originLocationRequest={originLocationRequest}
              onUseCurrentLocation={onUseCurrentLocationForOrigin}
              onCancelOriginLocationRequest={onCancelOriginLocationRequest}
            />
            <PlanEndpointControl
              key={`destination:${tripRequest.destination ? getTripEndpointKey(tripRequest.destination) : 'none'}`}
              role="destination"
              endpoint={tripRequest.destination}
              venues={venues}
              buildings={buildings}
              networkIndex={networkIndex}
              searchQuery={form.searchQueries.destination}
              onSearchQueryChange={(query) => form.onSearchQueryChange('destination', query)}
              onSearchFocus={onSearchFocus}
              onSearchCancel={onSearchCancel}
              onSearchResult={onSearchResult}
              onSelect={(endpoint) => form.onSelectEndpoint('destination', endpoint)}
              onClear={form.onClearDestinationEndpoint}
            />
            <IconButton
              variant="plain"
              className="plan-endpoint-swap"
              label="Swap origin and destination"
              icon={<ArrowDownUpIcon />}
              onClick={form.onSwap}
              disabled={!tripRequest.origin || !tripRequest.destination}
            />
          </div>
          <button
            type="button"
            className="plan-content-submit"
            onClick={form.onPlanJourney}
            disabled={path.status === 'loading'}
            aria-label="Get route"
          >
            <span>Get route</span>
            <ArrowRightIcon />
          </button>
        </div>
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
    </div>
  )
}
