import { useEffect, useRef, useState } from 'react'
import { validateTripRequest } from '../../../domain/trip/endpoints'
import { getTripEndpointKey } from '../../../domain/trip/endpoints'
import type { TransitIndex } from '../../../domain/transit'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripRequest,
} from '../../../domain/trip/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { PlanEndpointControl, type OriginLocationRequestState } from './plan-endpoint-control'
import { JourneyResults, type JourneyResultsState } from './journey-results'
import { formatSingaporeDateTime } from '../../../domain/trip/simulated-time'
import {
  ArrowDownUpIcon,
  ArrowRightIcon,
  EllipsisVerticalIcon,
} from '../../../ui/icons'
import { IconButton } from '../../../ui/button'
import { MenuItem } from '../../../ui/menu-item'
import '../styles/plan-content.css'

interface PlanContentProps {
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
  path?: JourneyResultsState
  simulatedAtMs?: number | null
}

const PLAN_CONTENT_PANEL_ID = 'plan-content-panel'

export function PlanContent({
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
}: PlanContentProps) {
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
    <div className="plan-content">
      <div className="plan-content-heading">
        <div className="plan-content-title">
          <h2>Plan trip</h2>
        </div>
        <div className="plan-content-menu" ref={tripActionsRef}>
          <IconButton
            variant="plain"
            label="Trip actions"
            title="Trip actions"
            icon={<EllipsisVerticalIcon />}
            expanded={tripActionsOpen}
            controls="plan-content-actions-menu"
            onClick={() => setTripActionsOpen((current) => !current)}
          />
          {tripActionsOpen && (
            <div id="plan-content-actions-menu" className="plan-content-menu-panel">
              <MenuItem
                label="Clear all"
                onClick={clearTrip}
                disabled={!tripRequest.origin && !tripRequest.destination}
              />
            </div>
          )}
        </div>
      </div>
      <div
        id={PLAN_CONTENT_PANEL_ID}
        className="navigation-panel-content navigation-panel-scroll-content plan-content-panel"
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
          <IconButton
            variant="plain"
            className="plan-endpoint-swap"
            label="Swap origin and destination"
            icon={<ArrowDownUpIcon />}
            onClick={swapTripEndpoints}
            disabled={!tripRequest.origin || !tripRequest.destination}
          />
          <button
            type="button"
            className="plan-content-submit"
            onClick={requestPlanJourney}
            disabled={path.status === 'loading'}
            aria-label="Get route"
            title="Get route"
          >
            <ArrowRightIcon />
          </button>
        </div>
        {visibleTripValidation && (
          <div className="plan-content-footer">
            <p className="plan-validation" role="status" aria-live="polite" aria-atomic="true">
              {visibleTripValidation}
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
          networkIndex={networkIndex}
          simulated={simulatedAtMs !== null}
          onSelectCandidate={onSelectJourneyOption}
        />
      </div>
    </div>
  )
}
