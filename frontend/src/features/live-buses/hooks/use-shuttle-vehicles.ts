import { useEffect, useRef, useState } from 'react'
import {
  SHUTTLE_VEHICLE_REFRESH_INTERVAL_MS,
  type ApiShuttleVehiclesResponse,
} from '@nusgo/shared'

export type ShuttleVehicleLoader = (
  routeIds: readonly string[],
  signal: AbortSignal,
) => Promise<ApiShuttleVehiclesResponse>

export type ShuttleVehiclesStatus = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error'

export interface ShuttleVehiclesState {
  readonly status: ShuttleVehiclesStatus
  readonly snapshot: ApiShuttleVehiclesResponse | null
}

interface ShuttleVehiclesRequestState extends ShuttleVehiclesState {
  readonly routeKey: string | null
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function useShuttleVehicles(
  loadVehicles: ShuttleVehicleLoader,
  active: boolean,
  routeIds: readonly string[],
): ShuttleVehiclesState {
  const [state, setState] = useState<ShuttleVehiclesRequestState>(() => ({
    routeKey: null,
    status: 'idle',
    snapshot: null,
  }))
  const routeKey = [...new Set(routeIds)].sort().join('\u0001')
  const hasActiveRoutes = active && routeIds.length > 0
  const latestRouteIdsRef = useRef(routeIds)

  useEffect(() => {
    latestRouteIdsRef.current = routeIds
  }, [routeIds])

  useEffect(() => {
    if (!hasActiveRoutes) return

    let disposed = false
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let controller: AbortController | null = null
    let requestVersion = 0

    const load = async (): Promise<void> => {
      if (document.visibilityState !== 'visible') return
      controller?.abort()
      const requestController = new AbortController()
      controller = requestController
      const currentRequestVersion = ++requestVersion
      setState((previous) => ({
        routeKey,
        status: previous.routeKey === routeKey && previous.snapshot ? 'refreshing' : 'loading',
        snapshot: previous.routeKey === routeKey ? previous.snapshot : null,
      }))

      try {
        const snapshot = await loadVehicles(latestRouteIdsRef.current, requestController.signal)
        if (disposed || currentRequestVersion !== requestVersion) return
        setState({ routeKey, status: 'ready', snapshot })
      } catch (error: unknown) {
        if (disposed || currentRequestVersion !== requestVersion || isAbortError(error)) return
        setState((previous) => ({
          routeKey,
          status: 'error',
          snapshot: previous.routeKey === routeKey ? previous.snapshot : null,
        }))
      }

      if (!disposed && currentRequestVersion === requestVersion && document.visibilityState === 'visible') {
        refreshTimer = setTimeout(() => { void load() }, SHUTTLE_VEHICLE_REFRESH_INTERVAL_MS)
      }
    }

    const refreshWhenVisible = (): void => {
      if (document.visibilityState !== 'visible') {
        requestVersion += 1
        controller?.abort()
        controller = null
        if (refreshTimer) clearTimeout(refreshTimer)
        refreshTimer = null
        setState((previous) => {
          const snapshot = previous.routeKey === routeKey ? previous.snapshot : null
          return { routeKey, status: snapshot ? 'ready' : 'idle', snapshot }
        })
        return
      }

      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = null
      void load()
    }

    document.addEventListener('visibilitychange', refreshWhenVisible)
    if (document.visibilityState === 'visible') void load()
    return () => {
      disposed = true
      requestVersion += 1
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      controller?.abort()
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  }, [hasActiveRoutes, loadVehicles, routeKey])

  if (!hasActiveRoutes) return { status: 'idle', snapshot: null }
  if (state.routeKey !== routeKey) {
    return {
      status: document.visibilityState === 'visible' ? 'loading' : 'idle',
      snapshot: null,
    }
  }
  return { status: state.status, snapshot: state.snapshot }
}
