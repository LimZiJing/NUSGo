import { useEffect, useRef, useState } from 'react'
import { validateTripRequest } from '../../domain/trip/endpoints'
import { getTripEndpointKey } from '../../domain/trip/endpoints'
import type { TransitIndex } from '../../domain/transit'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripRequest,
} from '../../domain/trip/types'
import type { VenueLocationMap } from '../../domain/venue/types'
import { PlanEndpointControl, type OriginLocationRequestState } from './plan-endpoint-control'
import { JourneyResult, type JourneyResultState } from './journey-result'
import { formatSingaporeDateTime } from '../../domain/trip/journey-test-clock'
import { ArrowDownUpIcon } from '../../ui/icons'

interface PlanViewProps {
  tripRequest: TripRequest
  venues: VenueLocationMap | null
  networkIndex: TransitIndex | null
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
  originLocationRequest?: OriginLocationRequestState
  onUseCurrentLocationForOrigin?: () => void
  onCancelOriginLocationRequest?: () => void
  journey?: JourneyResultState
  simulatedAtMs?: number | null
}

const PLAN_VIEW_CONTENT_ID = 'plan-view-content'

export function PlanView({
  tripRequest,
  venues,
  networkIndex,
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
  originLocationRequest = { status: 'idle', error: null },
  onUseCurrentLocationForOrigin,
  onCancelOriginLocationRequest,
  journey = { status: 'idle', journey: null, error: null },
  simulatedAtMs = null,
}: PlanViewProps) {
  const [searchQueries, setSearchQueries] = useState({
    origin: '',
    destination: '',
  })
  const [journeyReferenceTimeMs, setJourneyReferenceTimeMs] = useState<number | null>(null)
  const tripValidation = validateTripRequest(tripRequest)
  const setSearchQuery = (role: TripEndpointRole, query: string): void => {
    if (role === 'origin') onCancelOriginLocationRequest?.()
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
    <div className="plan-view">
      <div className="plan-view-heading">
        <div className="plan-view-title">
          <h2>Plan trip</h2>
        </div>
        <button
          type="button"
          className="plan-view-swap"
          onClick={swapTripEndpoints}
          disabled={!tripRequest.origin || !tripRequest.destination}
          aria-label="Swap origin and destination"
        >
          <ArrowDownUpIcon />
        </button>
      </div>
      <div
        id={PLAN_VIEW_CONTENT_ID}
        className="mobile-sheet-content mobile-sheet-scroll-content plan-view-content"
      >
        <div className="plan-endpoint-picker">
          <PlanEndpointControl
            key={`origin:${tripRequest.origin ? getTripEndpointKey(tripRequest.origin) : 'none'}`}
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
            originLocationRequest={originLocationRequest}
            onUseCurrentLocation={onUseCurrentLocationForOrigin}
            onCancelOriginLocationRequest={onCancelOriginLocationRequest}
          />
          <PlanEndpointControl
            key={`destination:${tripRequest.destination ? getTripEndpointKey(tripRequest.destination) : 'none'}`}
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
        <div className="plan-view-footer">
          {tripValidation && (
            <p className="plan-validation" role="status" aria-live="polite" aria-atomic="true">
              {tripValidation}
            </p>
          )}
          <div className="plan-view-actions">
            <button
              type="button"
              className="plan-view-clear-all"
              onClick={clearTrip}
              disabled={!tripRequest.origin && !tripRequest.destination}
            >
              Clear all
            </button>
            <button
              type="button"
              className="plan-view-submit"
              onClick={planJourney}
              disabled={tripValidation !== null || journey.status === 'loading'}
            >
              Get route
            </button>
          </div>
        </div>
        {simulatedAtMs !== null && (
          <p className="journey-notice" role="note">
            Simulated Journey at {formatSingaporeDateTime(simulatedAtMs).replace('T', ' ')} SGT.
            Each shuttle boarding uses a 5-minute test wait; these are not live arrivals.
          </p>
        )}
        <JourneyResult
          state={journey}
          venues={venues}
          networkIndex={networkIndex}
          simulated={simulatedAtMs !== null}
          referenceTimeMs={simulatedAtMs ?? journeyReferenceTimeMs}
        />
      </div>
    </div>
  )
}
