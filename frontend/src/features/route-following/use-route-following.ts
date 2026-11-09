import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { BusRoute, TransitStop } from '@nusgo/shared/transit/types'
import type { LocationTrackingState } from '../../domain/location/types'
import {
  findNearbyBusStopCandidates,
  getRouteStartIndex,
  isAtBusStop,
  isRouteFollowFixUsable,
  isWithinStopConfirmationRadius,
  MAX_ROUTE_FOLLOW_FIX_AGE_MS,
  STOP_CONFIRMATION_RESET_RADIUS_METERS,
  type TransitIndex,
} from '../../domain/transit'
import type { ShuttleArrivalSnapshot } from '../../domain/transit/arrivals'
import {
  SHUTTLE_ARRIVAL_MAX_AGE_MS,
  SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS,
} from '../../domain/transit/arrivals'

export interface RouteFollowingArrivalRequest {
  readonly stopId: string
  readonly stopName: string
}

export type RouteFollowingArrivalLoader = (
  stops: readonly RouteFollowingArrivalRequest[],
  signal: AbortSignal,
) => Promise<ShuttleArrivalSnapshot>

export interface RouteArrivalPrompt {
  readonly stop: TransitStop
  readonly route: BusRoute
  readonly createdAtMs?: number
}

interface ActiveRouteFollowing {
  readonly routeId: string
  readonly startIndex: number
  readonly stopIndex: number
}

interface RouteFollowingState {
  readonly currentStopId: string | null
  readonly currentStopConfirmed: boolean
  readonly activeFollowing: ActiveRouteFollowing | null
  readonly announcement: string
  readonly announcementRevision: number
}

type RouteFollowingAction =
  | { readonly type: 'set-current-stop'; readonly stopId: string; readonly announcement: string }
  | { readonly type: 'clear-current-stop'; readonly announcement: string }
  | { readonly type: 'announce'; readonly announcement: string }
  | {
    readonly type: 'start-route'
    readonly routeId: string
    readonly stopId: string
    readonly startIndex: number
    readonly stopIndex: number
    readonly confirmed: boolean
    readonly announcement: string
  }
  | { readonly type: 'stop-following'; readonly announcement?: string }
  | {
    readonly type: 'stop-reached'
    readonly routeId: string
    readonly previousStopIndex: number
    readonly stopId: string
    readonly stopIndex: number
    readonly confirmed: boolean
    readonly announcement: string
  }

const INITIAL_ROUTE_FOLLOWING_STATE: RouteFollowingState = {
  currentStopId: null,
  currentStopConfirmed: false,
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
      currentStopConfirmed: true,
      activeFollowing: null,
      announcement: action.announcement,
      announcementRevision: state.announcementRevision + 1,
    }
  }
  if (action.type === 'clear-current-stop') {
    return {
      ...state,
      currentStopId: null,
      currentStopConfirmed: false,
      activeFollowing: null,
      announcement: action.announcement,
      announcementRevision: state.announcementRevision + 1,
    }
  }
  if (action.type === 'announce') {
    return {
      ...state,
      announcement: action.announcement,
      announcementRevision: state.announcementRevision + 1,
    }
  }
  if (action.type === 'start-route') {
    return {
      ...state,
      currentStopId: action.stopId,
      currentStopConfirmed: action.confirmed,
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
    currentStopConfirmed: action.confirmed,
    activeFollowing: { ...state.activeFollowing, stopIndex: action.stopIndex },
    announcement: action.announcement,
    announcementRevision: state.announcementRevision + 1,
  }
}

export interface RouteFollowingWorkflow {
  readonly currentStop: TransitStop | null
  readonly hereStopId: string | null
  readonly suggestion: TransitStop | null
  readonly arrivalPrompt: RouteArrivalPrompt | null
  readonly activeRoute: BusRoute | null
  readonly activeStops: readonly TransitStop[]
  readonly activeStartIndex: number | null
  readonly activeStopIndex: number | null
  readonly announcement: string
  readonly announcementRevision: number
  readonly confirmSuggestion: () => void
  readonly dismissSuggestion: () => void
  readonly clearCurrentStop?: () => void
  readonly followArrivalRoute: () => boolean
  readonly dismissArrivalPrompt: () => void
  readonly demoFollowRoute: (routeId: string) => void
  readonly stopFollowing: () => void
}

export function useRouteFollowing(
  location: LocationTrackingState,
  transitIndex: TransitIndex | null,
  nowOverride?: number,
  loadArrivals?: RouteFollowingArrivalLoader,
  arrivalDataRevision?: number,
): RouteFollowingWorkflow {
  const [workflowState, dispatch] = useReducer(routeFollowingReducer, INITIAL_ROUTE_FOLLOWING_STATE)
  const [observedNow, setObservedNow] = useState(() => Date.now())
  const [isPageVisible, setIsPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  const now = nowOverride ?? observedNow
  const lastProgressFixTimestampRef = useRef<number | null>(null)
  const arrivalSampleRef = useRef<{ readonly stopId: string; readonly count: number } | null>(null)
  const encounteredStopIdsRef = useRef(new Set<string>())
  const arrivalPromptedRouteIdsRef = useRef(new Set<string>())
  const [nearbyStopQueue, setNearbyStopQueue] = useState<readonly string[]>([])
  const [arrivalQueue, setArrivalQueue] = useState<readonly RouteArrivalPrompt[]>([])
  const [arrivalSnapshot, setArrivalSnapshot] = useState<{
    readonly stopId: string
    readonly snapshot: ShuttleArrivalSnapshot
  } | null>(null)

  useEffect(() => {
    const updateVisibility = (): void => {
      setIsPageVisible(document.visibilityState === 'visible')
      setObservedNow(Date.now())
    }
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

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
    currentStopConfirmed,
    activeFollowing,
    announcement,
    announcementRevision,
  } = workflowState
  const currentStop = currentStopId ? transitIndex?.stopById.get(currentStopId) ?? null : null
  const activeRoute = activeFollowing ? transitIndex?.routeById.get(activeFollowing.routeId) ?? null : null
  const activeStops = useMemo(() => activeRoute && transitIndex
    ? activeRoute.stopIds.flatMap((stopId) => {
      const stop = transitIndex.stopById.get(stopId)
      return stop ? [stop] : []
    })
    : [], [activeRoute, transitIndex])
  const suggestion = useMemo(() => {
    if (!isPageVisible || !transitIndex || !isRouteFollowFixUsable(location.latestFix, now)) return null
    if (location.status !== 'tracking' || activeFollowing) return null
    const stopId = nearbyStopQueue[0]
    return stopId ? transitIndex.stopById.get(stopId) ?? null : null
  }, [activeFollowing, isPageVisible, location.latestFix, location.status, nearbyStopQueue, now, transitIndex])
  const canPromptAtCurrentStop = Boolean(
    isPageVisible && currentStop && currentStopConfirmed && location.status === 'tracking' &&
    isWithinStopConfirmationRadius(location.latestFix, currentStop, now),
  )

  useEffect(() => {
    if (!isPageVisible || !transitIndex || location.status !== 'tracking' || activeFollowing) {
      return
    }
    const fix = location.latestFix
    if (!isRouteFollowFixUsable(fix, now)) {
      return
    }

    const withinResetRadius = new Set(
      findNearbyBusStopCandidates(fix, transitIndex, STOP_CONFIRMATION_RESET_RADIUS_METERS, now)
        .map(({ stop }) => stop.id),
    )
    const candidates = findNearbyBusStopCandidates(fix, transitIndex, undefined, now)
    const candidateStopIds = candidates.map(({ stop }) => stop.id)
    const updateTimer = window.setTimeout(() => {
      for (const stopId of encounteredStopIdsRef.current) {
        if (!withinResetRadius.has(stopId)) encounteredStopIdsRef.current.delete(stopId)
      }
      const newlyReachedStopIds = candidateStopIds
        .filter((stopId) => !encounteredStopIdsRef.current.has(stopId))
      for (const stopId of newlyReachedStopIds) encounteredStopIdsRef.current.add(stopId)
      setNearbyStopQueue((current) => [
        ...current.filter((stopId) => withinResetRadius.has(stopId)),
        ...newlyReachedStopIds.filter((stopId) => !current.includes(stopId)),
      ])
    }, 0)
    return () => window.clearTimeout(updateTimer)
  }, [activeFollowing, isPageVisible, location.latestFix, location.status, now, transitIndex])

  useEffect(() => {
    if (
      !isPageVisible || !loadArrivals || !currentStop || activeFollowing || !canPromptAtCurrentStop
    ) return

    let disposed = false
    let refreshTimer: number | null = null
    let controller: AbortController | null = null

    const load = async (): Promise<void> => {
      controller = new AbortController()
      try {
        const snapshot = await loadArrivals(
          [{ stopId: currentStop.id, stopName: currentStop.longName }],
          controller.signal,
        )
        if (!disposed) setArrivalSnapshot({ stopId: currentStop.id, snapshot })
      } catch (error: unknown) {
        if (!disposed && !(error instanceof Error && error.name === 'AbortError')) setArrivalSnapshot(null)
      }
      if (!disposed) refreshTimer = window.setTimeout(() => { void load() }, SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS)
    }

    void load()
    return () => {
      disposed = true
      controller?.abort()
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
    }
  }, [activeFollowing, arrivalDataRevision, canPromptAtCurrentStop, currentStop, isPageVisible, loadArrivals])

  useEffect(() => {
    if (
      !transitIndex || !currentStop || !arrivalSnapshot || arrivalSnapshot.stopId !== currentStop.id ||
      !isPageVisible || location.status !== 'tracking' || activeFollowing || !canPromptAtCurrentStop
    ) return

    const observationAt = Date.parse(
      arrivalSnapshot.snapshot.stopObservations?.[currentStop.id]?.observedAt ?? arrivalSnapshot.snapshot.observedAt,
    )
    const ageMs = Math.max(0, now - observationAt)
    if (
      !Number.isFinite(observationAt) || ageMs > SHUTTLE_ARRIVAL_MAX_AGE_MS ||
      arrivalSnapshot.snapshot.unavailableStopIds?.includes(currentStop.id)
    ) return

    const arrivals = arrivalSnapshot.snapshot.stops[currentStop.id] ?? {}
    const routes = [...(transitIndex.routeIdsByStopId.get(currentStop.id) ?? [])]
      .flatMap((routeId) => {
        const route = transitIndex.routeById.get(routeId)
        const nextArrivalSeconds = arrivals[routeId]?.upcomingArrivalSeconds[0]
        if (!route || nextArrivalSeconds === undefined) return []
        const secondsUntilArrival = nextArrivalSeconds - Math.floor(ageMs / 1_000)
        return secondsUntilArrival >= 0 && secondsUntilArrival <= 60
          ? [{ stop: currentStop, route, createdAtMs: now }]
          : []
      })
    const newPrompts = routes.filter(({ route }) => !arrivalPromptedRouteIdsRef.current.has(route.id))
    if (newPrompts.length === 0) return
    for (const { route } of newPrompts) arrivalPromptedRouteIdsRef.current.add(route.id)
    setArrivalQueue((current) => [
      ...current,
      ...newPrompts.filter(({ route }) => !current.some((prompt) => prompt.route.id === route.id)),
    ])
  }, [activeFollowing, arrivalSnapshot, canPromptAtCurrentStop, currentStop, isPageVisible, location.status, now, transitIndex])
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
      encounteredStopIdsRef.current.add(reachedStop.id)
      arrivalPromptedRouteIdsRef.current.clear()
      dispatch({
        type: 'stop-reached',
        routeId: activeFollowing.routeId,
        previousStopIndex: activeFollowing.stopIndex,
        stopId: reachedStop.id,
        stopIndex,
        confirmed: true,
        announcement: stopIndex === activeRoute.stopIds.length - 1
          ? `${activeRoute.id} · Arrived · ${reachedStop.shortName || reachedStop.longName}`
          : `${activeRoute.id} · ${reachedStop.shortName || reachedStop.longName} · Approx.`,
      })
    }
  }, [activeFollowing, activeRoute, dispatch, location.latestFix, location.status, now, transitIndex])

  const confirmSuggestion = (): void => {
    if (!suggestion) return
    for (const stopId of nearbyStopQueue) encounteredStopIdsRef.current.add(stopId)
    setNearbyStopQueue([])
    arrivalSampleRef.current = null
    arrivalPromptedRouteIdsRef.current.clear()
    setArrivalQueue([])
    dispatch({
      type: 'set-current-stop',
      stopId: suggestion.id,
      announcement: `Here · ${suggestion.shortName || suggestion.longName}`,
    })
  }

  const dismissSuggestion = (): void => {
    if (!suggestion) return
    setNearbyStopQueue((current) => current.filter((stopId) => stopId !== suggestion.id))
  }

  const clearCurrentStop = (): void => {
    if (!currentStopConfirmed || !currentStopId || activeFollowing) return
    arrivalSampleRef.current = null
    setArrivalQueue([])
    setNearbyStopQueue([])
    setArrivalSnapshot(null)
    arrivalPromptedRouteIdsRef.current.clear()
    dispatch({ type: 'clear-current-stop', announcement: 'Current bus stop cleared' })
  }

  const requestFollowRoute = (routeId: string): boolean => {
    const route = transitIndex?.routeById.get(routeId)
    if (!route || !currentStop || !currentStopConfirmed) return false
    const currentIndex = getRouteStartIndex(route, currentStop.id)
    if (currentIndex < 0) return false

    encounteredStopIdsRef.current.add(currentStop.id)
    dispatch({
      type: 'start-route',
      routeId,
      stopId: currentStop.id,
      startIndex: currentIndex,
      stopIndex: currentIndex,
      confirmed: true,
      announcement: `Following ${route.id} · ${currentStop.shortName || currentStop.longName} · Approx.`,
    })
    setArrivalQueue([])
    setNearbyStopQueue([])
    lastProgressFixTimestampRef.current = location.latestFix?.timestamp ?? null
    arrivalSampleRef.current = null
    return true
  }

  const followArrivalRoute = (): boolean => {
    const prompt = arrivalQueue.find((item) => (
      item.stop.id === currentStopId && now - (item.createdAtMs ?? 0) <= 60_000
    ))
    if (!prompt) return false
    const started = requestFollowRoute(prompt.route.id)
    if (started) {
      setArrivalQueue([])
      setNearbyStopQueue([])
    }
    return started
  }

  const dismissArrivalPrompt = (): void => {
    const prompt = arrivalQueue.find((item) => (
      item.stop.id === currentStopId && now - (item.createdAtMs ?? 0) <= 60_000
    ))
    if (!prompt) return
    setArrivalQueue((current) => current.filter((item) => (
      item.route.id !== prompt.route.id || item.stop.id !== prompt.stop.id
    )))
  }


  const stopFollowing = (): void => {
    dispatch({
      type: 'stop-following',
      ...(activeRoute ? { announcement: `Stopped · ${activeRoute.id}` } : {}),
    })
    arrivalSampleRef.current = null
    setNearbyStopQueue([])
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
        confirmed: false,
        announcement: `Demo · ${route.id} · ${stop.shortName || stop.longName}`,
      })
      encounteredStopIdsRef.current.add(stop.id)
      arrivalPromptedRouteIdsRef.current.clear()
      setArrivalQueue([])
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
      confirmed: false,
      announcement: `Demo · ${route.id} · ${startStop.shortName || startStop.longName}`,
    })
    encounteredStopIdsRef.current.add(startStop.id)
    arrivalPromptedRouteIdsRef.current.clear()
    setArrivalQueue([])
    lastProgressFixTimestampRef.current = location.latestFix?.timestamp ?? null
    arrivalSampleRef.current = null
  }

  return {
    currentStop,
    hereStopId: currentStopConfirmed ? currentStopId : null,
    suggestion,
    arrivalPrompt: isPageVisible && currentStopConfirmed && !activeFollowing &&
      location.status === 'tracking' && canPromptAtCurrentStop
      ? arrivalQueue.find((item) => (
        item.stop.id === currentStopId && now - (item.createdAtMs ?? 0) <= 60_000
      )) ?? null
      : null,
    activeRoute,
    activeStops,
    activeStartIndex: activeFollowing?.startIndex ?? null,
    activeStopIndex: activeFollowing?.stopIndex ?? null,
    announcement,
    announcementRevision,
    confirmSuggestion,
    dismissSuggestion,
    clearCurrentStop,
    followArrivalRoute,
    dismissArrivalPrompt,
    demoFollowRoute,
    stopFollowing,
  }
}
