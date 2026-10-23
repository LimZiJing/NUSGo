import { useCallback, useMemo, useRef, useEffect } from 'react'
import type { DeviceLocationFix, LocationTrackingState } from '../../../domain/location/types'
import type { TransitIndex } from '../../../domain/transit'
import {
  isOlderPublicBusArrivalSnapshot,
  type PublicBusArrivalSnapshot,
} from '../../../domain/transit/public-bus-arrivals'
import type { ShuttleArrivalSnapshot } from '../../../domain/transit/arrivals'
import { getStopDetailsModel, type StopDetailsModel } from '../data/stop-details-model'
import { getStopsForList, getStopsWithinNearbyRadius, type StopListEntry } from '../data/stop-list-data'
import type { StopTimingDataOptions } from '../data/stop-timing-data'
import { useStopsArrivals, type StopsArrivalLoader } from './use-stops-arrivals'
import { useStopsServiceWindows, type StopsServiceWindowsLoader } from './use-stops-service-windows'
import { useStopsState } from '../state/use-stops-state'
import type { StopsState } from '../state/stops-state'

type Coordinate = { readonly longitude: number; readonly latitude: number }

export interface StopsWorkflowOptions {
  readonly transitIndex: TransitIndex | null
  readonly mapCenter: Coordinate | null
  readonly location: LocationTrackingState
  readonly active: boolean
  readonly loadArrivals: StopsArrivalLoader<ShuttleArrivalSnapshot>
  readonly loadPublicArrivals: StopsArrivalLoader<PublicBusArrivalSnapshot>
  readonly loadServiceWindows: StopsServiceWindowsLoader
  readonly requestLocation: (() => void) | null
  readonly locateFromControl: () => void
  readonly enableLocationTracking: () => void
}

export interface StopsWorkflow {
  readonly state: StopsState
  readonly favoriteStops: readonly { readonly id: string; readonly name: string }[]
  readonly selectedStop: StopDetailsModel | null
  readonly stopListEntries: readonly StopListEntry[]
  readonly stopListLoading: boolean
  /** Stop IDs within the Nearby radius of the settled map centre; empty outside Stops -> Nearby. */
  readonly nearbyHighlightStopIds: readonly string[]
  /** True only while Stops is the active view and Nearby is the selected list. */
  readonly showNearbyCrosshair: boolean
  readonly selectedStopFavorite: boolean
  readonly locationNotice: string | null
  readonly liveArrivalMessage: string | null
  readonly focusStop: (stopId: string) => void
  readonly selectStopList: (list: 'nearby' | 'favourites') => void
  readonly toggleFavorite: (stopId: string) => void
  readonly removeFavorite: (stopId: string) => void
  readonly clearFavoriteStops: () => void
  readonly toggleExpanded: (stopId: string) => void
  readonly dismissLocationNotice: () => void
  readonly backToStops: () => void
  readonly locateFromControl: () => void
}

function hasLocationError(location: LocationTrackingState): boolean {
  return ['denied', 'unavailable', 'timeout', 'invalid'].includes(location.status)
}

export function useStopsWorkflow({
  transitIndex,
  mapCenter,
  location,
  active,
  loadArrivals,
  loadPublicArrivals,
  loadServiceWindows,
  requestLocation,
  locateFromControl,
  enableLocationTracking,
}: StopsWorkflowOptions): StopsWorkflow {
  const [state, dispatch] = useStopsState(transitIndex)
  const initialNearbyLocationRequestedRef = useRef(false)
  const lastMapCenterRef = useRef<Coordinate | null>(null)
  const pendingNearbyExpansionRef = useRef(false)
  const locationError = hasLocationError(location)
  const locationFix: DeviceLocationFix | null = locationError ? null : location.latestFix

  const focusedStop = state.focusedStopId === null
    ? undefined
    : transitIndex?.stopById.get(state.focusedStopId)
  const nearbyEntries = useMemo(() => transitIndex ? getStopsForList(
    transitIndex,
    'nearby',
    mapCenter,
    locationFix,
    state.favoriteStopIds,
  ) : [], [locationFix, mapCenter, state.favoriteStopIds, transitIndex])
  const stopListData = useMemo(() => state.list === 'nearby'
    ? nearbyEntries
    : transitIndex ? getStopsForList(
      transitIndex,
      'favourites',
      mapCenter,
      locationFix,
      state.favoriteStopIds,
    ) : [], [locationFix, mapCenter, nearbyEntries, state.favoriteStopIds, state.list, transitIndex])

  const arrivalRequests = useMemo(() => {
    const requests = new Map<string, { readonly stopId: string; readonly stopName: string }>()
    for (const { stop } of stopListData) {
      requests.set(stop.id, { stopId: stop.id, stopName: stop.longName })
    }
    if (focusedStop) {
      requests.set(focusedStop.id, { stopId: focusedStop.id, stopName: focusedStop.longName })
    }
    return [...requests.values()]
  }, [focusedStop, stopListData])
  const stopArrivals = useStopsArrivals(loadArrivals, active, arrivalRequests)
  const publicArrivalRequests = useMemo(() => arrivalRequests.filter(({ stopId }) => (
    transitIndex?.stopById.get(stopId)?.services.some((service) => service.startsWith('PUB:')) ?? false
  )), [arrivalRequests, transitIndex])
  const publicStopArrivals = useStopsArrivals(
    loadPublicArrivals,
    active,
    publicArrivalRequests,
    isOlderPublicBusArrivalSnapshot,
  )
  const serviceRouteIds = useMemo(() => {
    const routeIds = new Set<string>()
    for (const { stopId } of arrivalRequests) {
      for (const routeId of transitIndex?.routeIdsByStopId.get(stopId) ?? []) routeIds.add(routeId)
    }
    return [...routeIds].sort()
  }, [arrivalRequests, transitIndex])
  const stopServiceWindows = useStopsServiceWindows(loadServiceWindows, active, serviceRouteIds)
  const stopArrivalsUpdating = stopArrivals.status === 'refreshing' || stopArrivals.status === 'error'
  const publicArrivalsUpdating = publicStopArrivals.status === 'refreshing' || publicStopArrivals.status === 'error'

  const timingOptions: StopTimingDataOptions = {
    favoriteStopIds: state.favoriteStopIds,
    arrivalSnapshot: stopArrivals.snapshot,
    nowMs: stopArrivals.nowMs,
    serviceWindows: stopServiceWindows.windows,
    isRefreshing: stopArrivalsUpdating,
    publicArrivalSnapshot: publicStopArrivals.snapshot,
    publicIsRefreshing: publicArrivalsUpdating,
  }
  const selectedStop = focusedStop && transitIndex
    ? getStopDetailsModel(focusedStop, transitIndex, timingOptions)
    : null
  // Uses the same settled centre and radius as the Nearby expansion, but ignores card expansion state.
  const nearbyHighlightStopIds = useMemo(() => active && state.list === 'nearby'
    ? getStopsWithinNearbyRadius(transitIndex, mapCenter).map(({ stop }) => stop.id)
    : [], [active, mapCenter, state.list, transitIndex])
  const stopListEntries: readonly StopListEntry[] = transitIndex
    ? stopListData.map(({ stop, distanceMeters }) => ({
      stop: getStopDetailsModel(stop, transitIndex, timingOptions),
      distanceMeters,
      favorite: state.favoriteStopIds.includes(stop.id),
      expanded: state.expandedStopIds[state.list].includes(stop.id),
    }))
    : []
  const favoriteStops = useMemo(() => state.favoriteStopIds.flatMap((stopId) => {
    const stop = transitIndex?.stopById.get(stopId)
    return stop ? [{ id: stop.id, name: stop.longName }] : []
  }), [state.favoriteStopIds, transitIndex])

  useEffect(() => {
    if (mapCenter) {
      const previousCenter = lastMapCenterRef.current
      if (
        previousCenter === null ||
        previousCenter.longitude !== mapCenter.longitude ||
        previousCenter.latitude !== mapCenter.latitude
      ) {
        pendingNearbyExpansionRef.current = true
        lastMapCenterRef.current = mapCenter
      }
    }

    if (
      !pendingNearbyExpansionRef.current || !transitIndex || !active ||
      state.list !== 'nearby' || !mapCenter
    ) return

    dispatch({
      type: 'set-nearby-expanded',
      stopIds: getStopsWithinNearbyRadius(transitIndex, mapCenter)
        .map(({ stop }) => stop.id),
    })
    pendingNearbyExpansionRef.current = false
  }, [active, dispatch, mapCenter, state.list, transitIndex])

  useEffect(() => {
    if (
      !requestLocation || !active || state.list !== 'nearby' ||
      location.status !== 'disabled' || initialNearbyLocationRequestedRef.current
    ) return
    initialNearbyLocationRequestedRef.current = true
    requestLocation?.()
  }, [active, location.status, requestLocation, state.list])

  const focusStop = useCallback((stopId: string): void => {
    dispatch({ type: 'focus-stop', stopId })
  }, [dispatch])
  const selectStopList = useCallback((list: 'nearby' | 'favourites'): void => {
    if (list === 'nearby' && location.status === 'disabled') enableLocationTracking()
    dispatch({ type: 'select-list', list })
  }, [dispatch, enableLocationTracking, location.status])
  const toggleFavorite = useCallback((stopId: string): void => {
    dispatch({ type: 'toggle-favorite', stopId })
  }, [dispatch])
  const removeFavorite = useCallback((stopId: string): void => {
    dispatch({ type: 'remove-favorite', stopId })
  }, [dispatch])
  const clearFavoriteStops = useCallback((): void => {
    dispatch({ type: 'clear-favorites' })
  }, [dispatch])
  const toggleExpanded = useCallback((stopId: string): void => {
    dispatch({ type: 'toggle-expanded', stopId })
  }, [dispatch])
  const dismissLocationNotice = useCallback((): void => {
    dispatch({ type: 'dismiss-location-notice' })
  }, [dispatch])
  const backToStops = useCallback((): void => {
    dispatch({ type: 'back-to-stops' })
  }, [dispatch])

  const locationNotice = locationError && !state.locationNoticeDismissed
    ? 'Location is unavailable. Showing stops near the map centre without distances.'
    : null
  const liveArrivalMessage = stopArrivals.snapshot || publicStopArrivals.snapshot
    ? null
    : stopArrivals.status === 'loading'
      ? 'Updating…'
      : stopArrivals.status === 'error'
        ? 'No live data'
        : null

  return {
    state,
    favoriteStops,
    selectedStop,
    stopListEntries,
    stopListLoading: !transitIndex || (state.list === 'nearby' && !mapCenter),
    nearbyHighlightStopIds,
    showNearbyCrosshair: active && state.list === 'nearby',
    selectedStopFavorite: focusedStop ? state.favoriteStopIds.includes(focusedStop.id) : false,
    locationNotice,
    liveArrivalMessage,
    focusStop,
    selectStopList,
    toggleFavorite,
    removeFavorite,
    clearFavoriteStops,
    toggleExpanded,
    dismissLocationNotice,
    backToStops,
    locateFromControl,
  }
}
