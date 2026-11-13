import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type CommunityWaypoint,
  type CommunityWaypointCategory,
} from '@nusgo/shared/waypoints/community'
import {
  filterCommunityWaypointsByCategory,
  getCommunityWaypointCategoryOptions,
} from './community-waypoint-discovery'
import {
  readCommunityWaypointVisibleCategories,
  writeCommunityWaypointVisibleCategories,
} from './community-waypoint-visibility-storage'

export type CommunityWaypointLoader = (signal: AbortSignal) => Promise<readonly CommunityWaypoint[]>

export type CommunityWaypointLoadState = 'loading' | 'ready' | 'failed'

export interface CommunityWaypointDiscovery {
  readonly status: CommunityWaypointLoadState
  readonly waypoints: readonly CommunityWaypoint[]
  readonly visibleWaypoints: readonly CommunityWaypoint[]
  readonly categoryOptions: ReturnType<typeof getCommunityWaypointCategoryOptions>
  readonly visibleCategories: readonly CommunityWaypointCategory[]
  readonly visibilitySaveStatus: string | null
  readonly selectedWaypoint: CommunityWaypoint | null
  toggleCategory(category: CommunityWaypointCategory): void
  showCategoryPanel(): void
  selectWaypoint(id: string, trigger?: HTMLButtonElement): void
  clearSelectedWaypoint(): void
  retry(): void
}

type LoadedState =
  | { readonly attempt: number; readonly status: 'loading' }
  | { readonly attempt: number; readonly status: 'failed' }
  | { readonly attempt: number; readonly status: 'ready'; readonly waypoints: readonly CommunityWaypoint[] }

interface CategorySelection {
  readonly categories: readonly CommunityWaypointCategory[]
  readonly status: string | null
}

const EMPTY_WAYPOINTS: readonly CommunityWaypoint[] = []

export function useCommunityWaypointDiscovery(
  load: CommunityWaypointLoader,
): CommunityWaypointDiscovery {
  const [loaded, setLoaded] = useState<LoadedState>({ attempt: 0, status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [selection, setSelection] = useState<CategorySelection>(() => {
    const { categories, error } = readCommunityWaypointVisibleCategories()
    return { categories, status: error }
  })
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
    () => filterCommunityWaypointsByCategory(waypoints, selection.categories),
    [selection.categories, waypoints],
  )
  const selectedWaypoint = waypoints.find(({ id }) => id === selectedWaypointId) ?? null

  /**
   * Toggles apply and persist in one step. A failed write leaves the selection in
   * place for this session and says so, so a private-mode visitor is warned rather
   * than silently losing their choice on reload.
   */
  const toggleCategory = useCallback((category: CommunityWaypointCategory): void => {
    setSelection((current) => {
      const categories = current.categories.includes(category)
        ? current.categories.filter((item) => item !== category)
        : [...current.categories, category]
      const persisted = writeCommunityWaypointVisibleCategories(categories)
      return {
        categories,
        status: persisted ? null : 'Category visibility is saved for this session only.',
      }
    })
  }, [])

  const showCategoryPanel = useCallback((): void => {
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
    visibleCategories: selection.categories,
    visibilitySaveStatus: selection.status,
    selectedWaypoint,
    toggleCategory,
    showCategoryPanel,
    selectWaypoint,
    clearSelectedWaypoint,
    retry,
  }
}
