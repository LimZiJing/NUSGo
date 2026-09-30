import { useEffect, useRef, useState } from 'react'
import {
  SHUTTLE_SERVICE_HOURS_REFRESH_INTERVAL_MS,
  type ShuttleServiceWindow,
} from '../../domain/transit/service-hours'

export type MobileStopServiceWindowsLoader = (
  routeIds: readonly string[],
  signal: AbortSignal,
) => Promise<Readonly<Record<string, readonly ShuttleServiceWindow[]>>>

export type MobileStopServiceWindowsStatus = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error'

export interface MobileStopServiceWindowsState {
  readonly status: MobileStopServiceWindowsStatus
  readonly windows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> | null
}

interface ServiceWindowsRequestState {
  readonly routeKey: string | null
  readonly status: MobileStopServiceWindowsStatus
  readonly windows: Readonly<Record<string, readonly ShuttleServiceWindow[]>> | null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function useMobileStopServiceWindows(
  loadServiceWindows: MobileStopServiceWindowsLoader,
  active: boolean,
  routeIds: readonly string[],
): MobileStopServiceWindowsState {
  const [state, setState] = useState<ServiceWindowsRequestState>(() => ({
    routeKey: null,
    status: 'idle',
    windows: null,
  }))
  const routeKey = [...routeIds].sort().join('\u0001')
  const hasRoutes = active && routeIds.length > 0
  // Location updates can recreate this array without changing the request.
  const latestRouteIdsRef = useRef(routeIds)

  useEffect(() => {
    latestRouteIdsRef.current = routeIds
  }, [routeIds])

  useEffect(() => {
    if (!hasRoutes) return

    let disposed = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let controller: AbortController | null = null

    const load = async (): Promise<void> => {
      controller?.abort()
      controller = new AbortController()
      setState((previous) => ({
        routeKey,
        status: previous.routeKey === routeKey && previous.windows ? 'refreshing' : 'loading',
        windows: previous.routeKey === routeKey ? previous.windows : null,
      }))

      try {
        const windows = await loadServiceWindows(latestRouteIdsRef.current, controller.signal)
        if (disposed) return
        setState({ routeKey, status: 'ready', windows })
      } catch (error: unknown) {
        if (disposed || isAbortError(error)) return
        setState((previous) => ({
          routeKey,
          status: 'error',
          windows: previous.routeKey === routeKey ? previous.windows : null,
        }))
      }

      if (!disposed) {
        refreshTimer = setTimeout(() => { void load() }, SHUTTLE_SERVICE_HOURS_REFRESH_INTERVAL_MS)
      }
    }

    void load()
    return () => {
      disposed = true
      controller?.abort()
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  }, [hasRoutes, loadServiceWindows, routeKey])

  if (!hasRoutes) return { status: 'idle', windows: null }
  return { status: state.status, windows: state.windows }
}
