import { useEffect, useRef, useState } from 'react'
import {
  SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS,
  type ShuttleArrivalSnapshot,
} from '../../domain/transit/arrivals'

export interface MobileStopArrivalStopRequest {
  readonly stopId: string
  readonly stopName: string
}

export type MobileStopArrivalLoader = (
  stops: readonly MobileStopArrivalStopRequest[],
  signal: AbortSignal,
) => Promise<ShuttleArrivalSnapshot>

export type MobileStopArrivalsStatus = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error'

export interface MobileStopArrivalsState {
  readonly status: MobileStopArrivalsStatus
  readonly snapshot: ShuttleArrivalSnapshot | null
  readonly nowMs: number
}

interface ArrivalRequestState {
  readonly stopKey: string | null
  readonly status: MobileStopArrivalsStatus
  readonly snapshot: ShuttleArrivalSnapshot | null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function isOlderSnapshot(
  candidate: ShuttleArrivalSnapshot,
  current: ShuttleArrivalSnapshot,
): boolean {
  if (candidate.snapshotVersion && current.snapshotVersion) {
    return candidate.snapshotVersion < current.snapshotVersion
  }
  const candidateTime = Date.parse(candidate.refreshedAt ?? candidate.observedAt)
  const currentTime = Date.parse(current.refreshedAt ?? current.observedAt)
  return candidateTime < currentTime
}

const STOP_SET_DEBOUNCE_MS = 150

export function useMobileStopArrivals(
  loadArrivals: MobileStopArrivalLoader,
  active: boolean,
  stops: readonly MobileStopArrivalStopRequest[],
): MobileStopArrivalsState {
  const [state, setState] = useState<ArrivalRequestState>(() => ({
    stopKey: null,
    status: 'idle',
    snapshot: null,
  }))
  const [nowMs, setNowMs] = useState(() => Date.now())
  const stopKey = stops
    .map(({ stopId, stopName }) => `${stopId}\u0000${stopName}`)
    .sort()
    .join('\u0001')
  const hasActiveStops = active && stops.length > 0
  // Location updates can recreate this array without changing the request.
  const latestStopsRef = useRef(stops)
  const previousStopKeyRef = useRef<string | null>(null)

  useEffect(() => {
    latestStopsRef.current = stops
  }, [stops])

  useEffect(() => {
    if (!hasActiveStops) return

    let disposed = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let stopSetTimer: ReturnType<typeof setTimeout> | null = null
    let controller: AbortController | null = null

    const load = async (): Promise<void> => {
      controller?.abort()
      controller = new AbortController()
      setState((previous) => ({
        stopKey,
        status: previous.snapshot ? 'refreshing' : 'loading',
        snapshot: previous.snapshot,
      }))

      try {
        const snapshot = await loadArrivals(latestStopsRef.current, controller.signal)
        if (disposed) return
        setState((previous) => ({
          stopKey,
          status: 'ready',
          snapshot: previous.snapshot && isOlderSnapshot(snapshot, previous.snapshot)
            ? previous.snapshot
            : snapshot,
        }))
      } catch (error: unknown) {
        if (disposed || isAbortError(error)) return
        setState((previous) => ({
          stopKey,
          status: 'error',
          snapshot: previous.snapshot,
        }))
      }

      if (!disposed) {
        refreshTimer = setTimeout(() => { void load() }, SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS)
      }
    }

    const shouldDebounce = previousStopKeyRef.current !== null && previousStopKeyRef.current !== stopKey
    previousStopKeyRef.current = stopKey
    if (shouldDebounce) {
      stopSetTimer = setTimeout(() => { void load() }, STOP_SET_DEBOUNCE_MS)
    } else {
      void load()
    }
    return () => {
      disposed = true
      controller?.abort()
      if (stopSetTimer) clearTimeout(stopSetTimer)
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  }, [hasActiveStops, loadArrivals, stopKey])

  useEffect(() => {
    if (!active) return
    const clock = setInterval(() => setNowMs(Date.now()), 1_000)
    return () => clearInterval(clock)
  }, [active])

  const visibleState: ArrivalRequestState = hasActiveStops
    ? state
    : { stopKey: null, status: 'idle', snapshot: null }

  return { status: visibleState.status, snapshot: visibleState.snapshot, nowMs }
}
