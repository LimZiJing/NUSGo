import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  COMMUNITY_WAYPOINT_READABLE_CATEGORIES,
  type CommunityWaypoint,
  type CommunityWaypointCategory,
} from '@nusgo/shared/waypoints/community'
import { filterCommunityWaypointsByCategory, getCommunityWaypointCategoryOptions } from './community-waypoint-discovery'

export type CommunityWaypointLoader = (signal: AbortSignal) => Promise<readonly CommunityWaypoint[]>

export type CommunityWaypointLoadState = 'loading' | 'ready' | 'failed'

export interface CommunityWaypointDiscovery {
  readonly status: CommunityWaypointLoadState
  readonly waypoints: readonly CommunityWaypoint[]
  readonly visibleWaypoints: readonly CommunityWaypoint[]
  readonly categoryOptions: ReturnType<typeof getCommunityWaypointCategoryOptions>
  readonly visibleCategories: readonly CommunityWaypointCategory[]
  readonly selectedWaypoint: CommunityWaypoint | null
  toggleCategory(category: CommunityWaypointCategory): void
  showAllCategories(): void
  showWaypointList(): void
  selectWaypoint(id: string, trigger?: HTMLButtonElement): void
  clearSelectedWaypoint(): void
  retry(): void
}

type LoadedState =
  | { readonly attempt: number; readonly status: 'loading' }
  | { readonly attempt: number; readonly status: 'failed' }
  | { readonly attempt: number; readonly status: 'ready'; readonly waypoints: readonly CommunityWaypoint[] }

const INITIAL_CATEGORIES = COMMUNITY_WAYPOINT_READABLE_CATEGORIES.map(({ value }) => value)
const EMPTY_WAYPOINTS: readonly CommunityWaypoint[] = []

export function useCommunityWaypointDiscovery(
  load: CommunityWaypointLoader,
): CommunityWaypointDiscovery {
  const [loaded, setLoaded] = useState<LoadedState>({ attempt: 0, status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [visibleCategories, setVisibleCategories] = useState<readonly CommunityWaypointCategory[]>(INITIAL_CATEGORIES)
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null)
  const returnFocusTarget = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const attempt = loadAttempt
    void load(controller.signal).then((waypoints) => {
      if (!controller.signal.aborted) setLoaded({ attempt, status: 'ready', waypoints })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      console.error('Community waypoint load failed:', error)
      setLoaded({ attempt, status: 'failed' })
    })
    return () => controller.abort()
  }, [load, loadAttempt])

  const currentLoaded = loaded.attempt === loadAttempt ? loaded : null
  const status = currentLoaded?.status ?? 'loading'
  const waypoints = currentLoaded?.status === 'ready' ? currentLoaded.waypoints : EMPTY_WAYPOINTS
  const categoryOptions = useMemo(
    () => getCommunityWaypointCategoryOptions(waypoints),
    [waypoints],
  )
  const visibleWaypoints = useMemo(
    () => filterCommunityWaypointsByCategory(waypoints, visibleCategories),
    [visibleCategories, waypoints],
  )
  const selectedWaypoint = waypoints.find(({ id }) => id === selectedWaypointId) ?? null

  const toggleCategory = useCallback((category: CommunityWaypointCategory): void => {
    setVisibleCategories((current) => current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category])
  }, [])

  const showAllCategories = useCallback((): void => {
    setVisibleCategories(INITIAL_CATEGORIES)
  }, [])

  const showWaypointList = useCallback((): void => {
    returnFocusTarget.current = null
    setSelectedWaypointId(null)
  }, [])

  const selectWaypoint = useCallback((id: string, trigger?: HTMLButtonElement): void => {
    returnFocusTarget.current = trigger ?? null
    setSelectedWaypointId(id)
  }, [])

  const clearSelectedWaypoint = useCallback((): void => {
    const target = returnFocusTarget.current
    returnFocusTarget.current = null
    setSelectedWaypointId(null)
    if (!target?.isConnected) return
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => target.focus())
    } else {
      target.focus()
    }
  }, [])

  const retry = useCallback((): void => setLoadAttempt((attempt) => attempt + 1), [])

  return {
    status,
    waypoints,
    visibleWaypoints,
    categoryOptions,
    visibleCategories,
    selectedWaypoint,
    toggleCategory,
    showAllCategories,
    showWaypointList,
    selectWaypoint,
    clearSelectedWaypoint,
    retry,
  }
}
