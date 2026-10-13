import { useEffect, useRef, useState } from 'react'
import { validateTripRequest } from '../../domain/trip/endpoints'
import { getTripEndpointKey } from '../../domain/trip/endpoints'
import type { TransitIndex } from '../../domain/transit'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripRequest,
} from '../../domain/trip/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { PlanEndpointControl, type OriginLocationRequestState } from './plan-endpoint-control'
import { JourneyResult, type JourneyResultState } from './journey-result'
import { formatSingaporeDateTime } from '../../domain/trip/simulated-time'
import {
  ArrowDownUpIcon,
  ArrowRightIcon,
  EllipsisVerticalIcon,
} from '../../ui/icons'
import './styles/plan-view.css'

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
  onSelectJourneyOption?: (candidateKey: string) => void
  onUseCurrentLocationForOrigin?: () => void
  onCancelOriginLocationRequest?: () => void
  path?: JourneyResultState
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
  onSelectJourneyOption,
  onUseCurrentLocationForOrigin,
  onCancelOriginLocationRequest,
  path = { status: 'idle', path: null, candidates: [], error: null },
  simulatedAtMs = null,
}: PlanViewProps) {
  const [searchQueries, setSearchQueries] = useState({
    origin: '',
    destination: '',
  })
  const [tripActionsOpen, setTripActionsOpen] = useState(false)
  const [planAttempted, setPlanAttempted] = useState(false)
  const tripActionsRef = useRef<HTMLDivElement>(null)
  const tripValidation = validateTripRequest(tripRequest)
  // Validation is shown only after Get route is pressed, so an empty Plan form starts quietly.
  const visibleTripValidation = planAttempted ? tripValidation : null
  const requestPlanJourney = (): void => {
    if (tripValidation) {
      setPlanAttempted(true)
      return
    }
    onPlanJourney()
  }
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
    setPlanAttempted(false)
    setTripActionsOpen(false)
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

  useEffect(() => {
    if (!tripActionsOpen) return
    const closeTripActions = (event: PointerEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      if (event instanceof PointerEvent) {
        const target = event.target
        if (target instanceof Node && tripActionsRef.current?.contains(target)) return
      }
      setTripActionsOpen(false)
    }
    document.addEventListener('pointerdown', closeTripActions)
    document.addEventListener('keydown', closeTripActions)
    return () => {
      document.removeEventListener('pointerdown', closeTripActions)
      document.removeEventListener('keydown', closeTripActions)
    }
  }, [tripActionsOpen])

  return (
    <div className="plan-view">
      <div className="plan-view-heading">
        <div className="plan-view-title">
          <h2>Plan trip</h2>
        </div>
        <div className="plan-view-menu" ref={tripActionsRef}>
          <button
            type="button"
            className="plan-view-menu-trigger"
            aria-expanded={tripActionsOpen}
            aria-controls="plan-view-actions-menu"
            aria-label="Trip actions"
            title="Trip actions"
            onClick={() => setTripActionsOpen((current) => !current)}
          >
            <EllipsisVerticalIcon />
          </button>
          {tripActionsOpen && (
            <div id="plan-view-actions-menu" className="plan-view-menu-panel">
              <button
                type="button"
                className="plan-view-menu-item"
                onClick={clearTrip}
                disabled={!tripRequest.origin && !tripRequest.destination}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        id={PLAN_VIEW_CONTENT_ID}
        className="navigation-panel-content navigation-panel-scroll-content plan-view-content"
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
          <button
            type="button"
            className="plan-endpoint-swap"
            onClick={swapTripEndpoints}
            disabled={!tripRequest.origin || !tripRequest.destination}
            aria-label="Swap origin and destination"
          >
            <ArrowDownUpIcon />
          </button>
          <button
            type="button"
            className="plan-view-submit"
            onClick={requestPlanJourney}
            disabled={path.status === 'loading'}
            aria-label="Get route"
            title="Get route"
          >
            <ArrowRightIcon />
          </button>
        </div>
        {visibleTripValidation && (
          <div className="plan-view-footer">
            <p className="plan-validation" role="status" aria-live="polite" aria-atomic="true">
              {visibleTripValidation}
            </p>
          </div>
        )}
        {simulatedAtMs !== null && (
          <p className="journey-notice" role="note">
            Simulated Journey at {formatSingaporeDateTime(simulatedAtMs).replace('T', ' ')} SGT.
            Each shuttle boarding uses a 5-minute test wait; these are not live arrivals.
          </p>
        )}
        <JourneyResult
          state={path}
          venues={venues}
          networkIndex={networkIndex}
          simulated={simulatedAtMs !== null}
          onSelectCandidate={onSelectJourneyOption}
        />
      </div>
    </div>
  )
}
