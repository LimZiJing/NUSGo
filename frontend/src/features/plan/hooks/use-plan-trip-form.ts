import { useEffect, useRef, useState } from 'react'
import { validateTripRequest } from '../../../domain/trip/endpoints'
import type {
  TripEndpoint,
  TripEndpointRole,
  TripRequest,
} from '../../../domain/trip/types'

export interface PlanTripFormOptions {
  readonly tripRequest: TripRequest
  readonly onSwap: () => void
  readonly onSelectOriginEndpoint: (endpoint: TripEndpoint) => void
  readonly onClearOriginEndpoint: () => void
  readonly onSelectDestinationEndpoint: (endpoint: TripEndpoint) => void
  readonly onClearDestinationEndpoint: () => void
  readonly onClearTrip: () => void
  readonly onPlanJourney: () => void
  readonly onCancelOriginLocationRequest?: () => void
}

export interface PlanTripFormBindings {
  readonly searchQueries: Readonly<Record<TripEndpointRole, string>>
  readonly validationMessage: string | null
  readonly onSearchQueryChange: (role: TripEndpointRole, query: string) => void
  readonly onSelectEndpoint: (role: TripEndpointRole, endpoint: TripEndpoint) => void
  readonly onClearOriginEndpoint: () => void
  readonly onClearDestinationEndpoint: () => void
  readonly onClearTrip: () => void
  readonly onPlanJourney: () => void
  readonly onSwap: () => void
}

export function usePlanTripForm({
  tripRequest,
  onSwap,
  onSelectOriginEndpoint,
  onClearOriginEndpoint,
  onSelectDestinationEndpoint,
  onClearDestinationEndpoint,
  onClearTrip,
  onPlanJourney,
  onCancelOriginLocationRequest,
}: PlanTripFormOptions): PlanTripFormBindings {
  const [searchQueries, setSearchQueries] = useState<Record<TripEndpointRole, string>>({
    origin: '',
    destination: '',
  })
  const [planAttempted, setPlanAttempted] = useState(false)
  const previousTripRequest = useRef(tripRequest)
  const skipEndpointReset = useRef(false)
  const tripValidation = validateTripRequest(tripRequest)
  // Validation stays quiet until the user asks for a route, then follows the current endpoint state.

  const onSearchQueryChange = (role: TripEndpointRole, query: string): void => {
    if (role === 'origin') onCancelOriginLocationRequest?.()
    setSearchQueries((current) => ({ ...current, [role]: query }))
  }

  const onSelectEndpoint = (role: TripEndpointRole, endpoint: TripEndpoint): void => {
    onSearchQueryChange(role, '')
    if (role === 'origin') onSelectOriginEndpoint(endpoint)
    else onSelectDestinationEndpoint(endpoint)
  }

  const clearTrip = (): void => {
    setSearchQueries({ origin: '', destination: '' })
    setPlanAttempted(false)
    onClearTrip()
  }

  const swapEndpoints = (): void => {
    // Swapping should preserve any in-progress query text; direct endpoint selection clears its field.
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
    // Selecting an endpoint clears only that endpoint's stale query; deselecting or changing the other field is preserved.
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

  return {
    searchQueries,
    validationMessage: planAttempted ? tripValidation : null,
    onSearchQueryChange,
    onSelectEndpoint,
    onClearOriginEndpoint,
    onClearDestinationEndpoint,
    onClearTrip: clearTrip,
    onPlanJourney: () => {
      if (tripValidation) {
        setPlanAttempted(true)
        return
      }
      onPlanJourney()
    },
    onSwap: swapEndpoints,
  }
}
