import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { BusRoute, TransitStop } from '@nusgo/shared/transit/types'
import type { LocationTrackingState } from '../../domain/location/types'
import type { TransitIndex } from '../../domain/transit'
import {
  findNearbyBusStopSuggestion,
  findRouteStopSuggestion,
  getRouteStartIndex,
  isAtBusStop,
  MAX_ROUTE_FOLLOW_FIX_AGE_MS,
} from '../../domain/transit'

interface ActiveRouteFollowing {
  readonly routeId: string
  readonly startIndex: number
  readonly stopIndex: number
}

interface RouteFollowingState {
  readonly currentStopId: string | null
  readonly dismissedStopIds: ReadonlySet<string>
  readonly pendingRouteId: string | null
  readonly activeFollowing: ActiveRouteFollowing | null
  readonly announcement: string
  readonly announcementRevision: number
}

type RouteFollowingAction =
  | {
    readonly type: 'set-current-stop'
    readonly stopId: string
    readonly activeFollowing: ActiveRouteFollowing | null
    readonly announcement: string
  }
  | { readonly type: 'clear-current-stop'; readonly announcement?: string }
  | { readonly type: 'dismiss-suggestion'; readonly stopId: string; readonly announcement: string }
  | { readonly type: 'request-route'; readonly routeId: string }
  | { readonly type: 'cancel-route-start' }
  | {
    readonly type: 'start-route'
    readonly routeId: string
    readonly stopId: string
    readonly startIndex: number
    readonly stopIndex: number
    readonly announcement: string
  }
  | { readonly type: 'stop-following'; readonly announcement?: string }
  | {
    readonly type: 'stop-reached'
    readonly routeId: string
    readonly previousStopIndex: number
    readonly stopId: string
    readonly stopIndex: number
    readonly announcement: string
  }

const INITIAL_ROUTE_FOLLOWING_STATE: RouteFollowingState = {
  currentStopId: null,
  dismissedStopIds: new Set(),
  pendingRouteId: null,
  activeFollowing: null,
  announcement: '',
  announcementRevision: 0,
}

function routeFollowingReducer(
  state: RouteFollowingState,
  action: RouteFollowingAction,
): RouteFollowingState {
  if (action.type === 'set-current-stop') {
    return {
      ...state,
      currentStopId: action.stopId,
      dismissedStopIds: new Set(state.dismissedStopIds).add(action.stopId),
      activeFollowing: action.activeFollowing,
      announcement: action.announcement,
      announcementRevision: state.announcementRevision + 1,
    }
  }
  if (action.type === 'clear-current-stop') {
    return {
      ...state,
      currentStopId: null,
      pendingRouteId: null,
      activeFollowing: null,
      announcement: action.announcement ?? 'Current stop cleared',
      announcementRevision: state.announcementRevision + 1,
    }
  }
  if (action.type === 'dismiss-suggestion') {
    return {
      ...state,
      dismissedStopIds: new Set(state.dismissedStopIds).add(action.stopId),
      announcement: action.announcement,
      announcementRevision: state.announcementRevision + 1,
    }
  }
  if (action.type === 'request-route') return { ...state, pendingRouteId: action.routeId }
  if (action.type === 'cancel-route-start') return { ...state, pendingRouteId: null }
  if (action.type === 'start-route') {
    return {
      ...state,
      currentStopId: action.stopId,
      dismissedStopIds: new Set(state.dismissedStopIds).add(action.stopId),
      pendingRouteId: null,
      activeFollowing: {
        routeId: action.routeId,
        startIndex: action.startIndex,
        stopIndex: action.stopIndex,
      },
      announcement: action.announcement,
      announcementRevision: state.announcementRevision + 1,
    }
  }
  if (action.type === 'stop-following') {
    return {
      ...state,
      pendingRouteId: null,
      activeFollowing: null,
      announcement: action.announcement ?? state.announcement,
      announcementRevision: action.announcement
        ? state.announcementRevision + 1
        : state.announcementRevision,
    }
  }
  if (
    state.activeFollowing?.routeId !== action.routeId ||
    state.activeFollowing.stopIndex !== action.previousStopIndex
  ) return state

  return {
    ...state,
    currentStopId: action.stopId,
    dismissedStopIds: new Set(state.dismissedStopIds).add(action.stopId),
    activeFollowing: { ...state.activeFollowing, stopIndex: action.stopIndex },
    announcement: action.announcement,
    announcementRevision: state.announcementRevision + 1,
  }
}

export interface RouteFollowingWorkflow {
  readonly currentStop: TransitStop | null
  readonly dismissedStopIds: ReadonlySet<string>
  readonly suggestion: TransitStop | null
  readonly pendingRoute: BusRoute | null
  readonly pendingRouteSuggestion: TransitStop | null
  readonly activeRoute: BusRoute | null
  readonly activeStops: readonly TransitStop[]
  readonly activeStartIndex: number | null
  readonly activeStopIndex: number | null
  readonly announcement: string
  readonly announcementRevision: number
  readonly setCurrentStop: (stopId: string) => void
  readonly clearCurrentStop: () => void
  readonly confirmSuggestion: () => void
  readonly dismissSuggestion: () => void
  readonly requestFollowRoute: (routeId: string) => boolean
  readonly demoFollowRoute: (routeId: string) => void
  readonly startAtStop: (stopId: string) => void
  readonly cancelRouteStart: () => void
  readonly stopFollowing: () => void
}

export function useRouteFollowing(
  location: LocationTrackingState,
  transitIndex: TransitIndex | null,
  nowOverride?: number,
): RouteFollowingWorkflow {
  const [workflowState, dispatch] = useReducer(routeFollowingReducer, INITIAL_ROUTE_FOLLOWING_STATE)
  const [observedNow, setObservedNow] = useState(() => Date.now())
  const now = nowOverride ?? observedNow
  const lastProgressFixTimestampRef = useRef<number | null>(null)
  const arrivalSampleRef = useRef<{ readonly stopId: string; readonly count: number } | null>(null)

  useEffect(() => {
    const fix = location.latestFix
    if (nowOverride !== undefined || !fix) return

    const timeUntilExpiry = fix.timestamp + MAX_ROUTE_FOLLOW_FIX_AGE_MS - now + 1
    if (timeUntilExpiry <= 0) return

    const timeout = window.setTimeout(() => setObservedNow(Date.now()), timeUntilExpiry)
    return () => window.clearTimeout(timeout)
  }, [location.latestFix, now, nowOverride])

  const {
    currentStopId,
    dismissedStopIds,
    pendingRouteId,
    activeFollowing,
    announcement,
    announcementRevision,
  } = workflowState
  const currentStop = currentStopId ? transitIndex?.stopById.get(currentStopId) ?? null : null
  const pendingRoute = pendingRouteId ? transitIndex?.routeById.get(pendingRouteId) ?? null : null
  const activeRoute = activeFollowing ? transitIndex?.routeById.get(activeFollowing.routeId) ?? null : null
  const activeStops = useMemo(() => activeRoute && transitIndex
    ? activeRoute.stopIds.flatMap((stopId) => {
      const stop = transitIndex.stopById.get(stopId)
      return stop ? [stop] : []
    })
    : [], [activeRoute, transitIndex])
  const suggestion = useMemo(() => (
    !currentStopId && !pendingRouteId && !activeFollowing && location.status === 'tracking' && transitIndex
      ? findNearbyBusStopSuggestion(location.latestFix, transitIndex, dismissedStopIds, now)
      : null
  ), [activeFollowing, currentStopId, dismissedStopIds, location, now, pendingRouteId, transitIndex])
  const pendingRouteSuggestion = useMemo(() => (
    pendingRoute && location.status === 'tracking' && transitIndex
      ? findRouteStopSuggestion(location.latestFix, pendingRoute, transitIndex, dismissedStopIds, now)
      : null
  ), [dismissedStopIds, location, now, pendingRoute, transitIndex])
  useEffect(() => {
    if (!activeFollowing || !activeRoute || !transitIndex || location.status !== 'tracking') {
      arrivalSampleRef.current = null
      return
    }

    const fix = location.latestFix
    if (!fix || (lastProgressFixTimestampRef.current !== null && fix.timestamp <= lastProgressFixTimestampRef.current)) return
    lastProgressFixTimestampRef.current = fix.timestamp

    const nextStopId = activeRoute.stopIds[activeFollowing.stopIndex + 1]
    const nextStop = nextStopId ? transitIndex.stopById.get(nextStopId) : undefined
    if (!nextStop || !isAtBusStop(fix, nextStop, now)) {
      arrivalSampleRef.current = null
      return
    }

    const previousSample = arrivalSampleRef.current
    const count = previousSample?.stopId === nextStop.id ? previousSample.count + 1 : 1
    if (count < 2) {
      arrivalSampleRef.current = { stopId: nextStop.id, count }
      return
    }

    arrivalSampleRef.current = null
    const stopIndex = activeFollowing.stopIndex + 1
    const reachedStop = transitIndex.stopById.get(activeRoute.stopIds[stopIndex])
    if (reachedStop) {
      dispatch({
        type: 'stop-reached',
        routeId: activeFollowing.routeId,
        previousStopIndex: activeFollowing.stopIndex,
        stopId: reachedStop.id,
        stopIndex,
        announcement: stopIndex === activeRoute.stopIds.length - 1
          ? `${activeRoute.id} · Arrived · ${reachedStop.shortName || reachedStop.longName}`
          : `${activeRoute.id} · ${reachedStop.shortName || reachedStop.longName} · Approx.`,
      })
    }
  }, [activeFollowing, activeRoute, dispatch, location.latestFix, location.status, now, transitIndex])

  const setCurrentStop = (stopId: string): void => {
    const stop = transitIndex?.stopById.get(stopId)
    if (!stop) return
    arrivalSampleRef.current = null

    const route = activeFollowing ? transitIndex?.routeById.get(activeFollowing.routeId) : undefined
    const stopIndex = route ? getRouteStartIndex(route, stopId) : -1
    const nextActiveFollowing = activeFollowing && stopIndex >= 0
      ? { ...activeFollowing, startIndex: stopIndex, stopIndex }
      : null
    dispatch({
      type: 'set-current-stop',
      stopId,
      activeFollowing: nextActiveFollowing,
      announcement: nextActiveFollowing && route
        ? `${route.id} · ${stop.shortName || stop.longName} · Approx.`
        : `Current stop · ${stop.shortName || stop.longName}`,
    })
    if (nextActiveFollowing) lastProgressFixTimestampRef.current = location.latestFix?.timestamp ?? null
  }

  const clearCurrentStop = (): void => {
    if (!currentStopId) return
    dispatch({
      type: 'clear-current-stop',
      announcement: 'Current stop cleared',
    })
    arrivalSampleRef.current = null
  }

  const confirmSuggestion = (): void => {
    if (suggestion) setCurrentStop(suggestion.id)
  }

  const dismissSuggestion = (): void => {
    if (!suggestion) return
    dispatch({
      type: 'dismiss-suggestion',
      stopId: suggestion.id,
      announcement: `Dismissed · ${suggestion.shortName || suggestion.longName}`,
    })
  }

  const startAtStop = (stopId: string): void => {
    if (!pendingRoute || !transitIndex || !pendingRoute.stopIds.includes(stopId)) return
    const stop = transitIndex.stopById.get(stopId)
    const stopIndex = getRouteStartIndex(pendingRoute, stopId)
    if (!stop || stopIndex < 0) return
    dispatch({
      type: 'start-route',
      routeId: pendingRoute.id,
      stopId,
      startIndex: stopIndex,
      stopIndex,
      announcement: `Following ${pendingRoute.id} · ${stop.shortName || stop.longName} · Approx.`,
    })
    lastProgressFixTimestampRef.current = location.latestFix?.timestamp ?? null
    arrivalSampleRef.current = null
  }

  const requestFollowRoute = (routeId: string): boolean => {
    const route = transitIndex?.routeById.get(routeId)
    if (!route) return false
    const currentIndex = currentStopId ? getRouteStartIndex(route, currentStopId) : -1
    if (currentIndex >= 0 && currentStop) {
      dispatch({
        type: 'start-route',
        routeId,
        stopId: currentStop.id,
        startIndex: currentIndex,
        stopIndex: currentIndex,
        announcement: `Following ${route.id} · ${currentStop.shortName || currentStop.longName} · Approx.`,
      })
      lastProgressFixTimestampRef.current = location.latestFix?.timestamp ?? null
      arrivalSampleRef.current = null
      return true
    }

    dispatch({ type: 'request-route', routeId })
    return false
  }

  const cancelRouteStart = (): void => dispatch({ type: 'cancel-route-start' })

  const stopFollowing = (): void => {
    dispatch({
      type: 'stop-following',
      ...(activeRoute ? { announcement: `Stopped · ${activeRoute.id}` } : {}),
    })
    arrivalSampleRef.current = null
  }

  const demoFollowRoute = (routeId: string): void => {
    if (!transitIndex) return
    const route = transitIndex.routeById.get(routeId)
    if (!route || route.stopIds.length === 0) return

    if (activeFollowing?.routeId === routeId && activeFollowing.stopIndex < route.stopIds.length - 1) {
      const stopIndex = activeFollowing.stopIndex + 1
      const stop = transitIndex.stopById.get(route.stopIds[stopIndex])
      if (!stop) return
      dispatch({
        type: 'stop-reached',
        routeId,
        previousStopIndex: activeFollowing.stopIndex,
        stopId: stop.id,
        stopIndex,
        announcement: `Demo · ${route.id} · ${stop.shortName || stop.longName}`,
      })
      lastProgressFixTimestampRef.current = location.latestFix?.timestamp ?? null
      arrivalSampleRef.current = null
      return
    }

    const startStopId = route.stopIds[0]
    if (!startStopId) return
    const startStop = transitIndex.stopById.get(startStopId)
    if (!startStop) return
    dispatch({
      type: 'start-route',
      routeId,
      stopId: startStop.id,
      startIndex: 0,
      stopIndex: 0,
      announcement: `Demo · ${route.id} · ${startStop.shortName || startStop.longName}`,
    })
    lastProgressFixTimestampRef.current = location.latestFix?.timestamp ?? null
    arrivalSampleRef.current = null
  }

  return {
    currentStop,
    dismissedStopIds,
    suggestion,
    pendingRoute,
    pendingRouteSuggestion,
    activeRoute,
    activeStops,
    activeStartIndex: activeFollowing?.startIndex ?? null,
    activeStopIndex: activeFollowing?.stopIndex ?? null,
    announcement,
    announcementRevision,
    setCurrentStop,
    clearCurrentStop,
    confirmSuggestion,
    dismissSuggestion,
    requestFollowRoute,
    demoFollowRoute,
    startAtStop,
    cancelRouteStart,
    stopFollowing,
  }
}
