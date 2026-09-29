import { useEffect, useState } from 'react'
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
  const stopKey = stops.map(({ stopId, stopName }) => `${stopId}\u0000${stopName}`).join('\u0001')
  const hasActiveStops = active && stops.length > 0

  useEffect(() => {
    if (!hasActiveStops) return

    let disposed = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let controller: AbortController | null = null

    const load = async (): Promise<void> => {
      controller?.abort()
      controller = new AbortController()
      setState((previous) => ({
        stopKey,
        status: previous.stopKey === stopKey && previous.snapshot ? 'refreshing' : 'loading',
        snapshot: previous.stopKey === stopKey ? previous.snapshot : null,
      }))

      try {
        const snapshot = await loadArrivals(stops, controller.signal)
        if (disposed) return
        setState({ stopKey, status: 'ready', snapshot })
      } catch (error: unknown) {
        if (disposed || isAbortError(error)) return
        setState((previous) => ({
          stopKey,
          status: 'error',
          snapshot: previous.stopKey === stopKey ? previous.snapshot : null,
        }))
      }

      if (!disposed) {
        refreshTimer = setTimeout(() => { void load() }, SHUTTLE_ARRIVAL_REFRESH_INTERVAL_MS)
      }
    }

    void load()
    return () => {
      disposed = true
      controller?.abort()
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  }, [hasActiveStops, loadArrivals, stopKey, stops])

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
