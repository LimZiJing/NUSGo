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
  readonly draftVisibleCategories: readonly CommunityWaypointCategory[]
  readonly hasPendingVisibilityChanges: boolean
  readonly visibilitySaveStatus: string | null
  readonly selectedWaypoint: CommunityWaypoint | null
  toggleCategory(category: CommunityWaypointCategory): void
  saveVisibilitySelection(): void
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
  readonly saved: readonly CommunityWaypointCategory[]
  readonly draft: readonly CommunityWaypointCategory[]
}

const EMPTY_WAYPOINTS: readonly CommunityWaypoint[] = []

function sameCategories(
  first: readonly CommunityWaypointCategory[],
  second: readonly CommunityWaypointCategory[],
): boolean {
  return first.length === second.length && first.every((category) => second.includes(category))
}

export function useCommunityWaypointDiscovery(
  load: CommunityWaypointLoader,
): CommunityWaypointDiscovery {
  const [loaded, setLoaded] = useState<LoadedState>({ attempt: 0, status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [selection, setSelection] = useState<CategorySelection>(() => {
    const saved = readCommunityWaypointVisibleCategories()
    return { saved, draft: saved }
  })
  const [visibilitySaveStatus, setVisibilitySaveStatus] = useState<string | null>(null)
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
    () => filterCommunityWaypointsByCategory(waypoints, selection.draft),
    [selection.draft, waypoints],
  )
  const selectedWaypoint = waypoints.find(({ id }) => id === selectedWaypointId) ?? null
  const hasPendingVisibilityChanges = !sameCategories(selection.saved, selection.draft)

  const toggleCategory = useCallback((category: CommunityWaypointCategory): void => {
    setSelection((current) => ({
      ...current,
      draft: current.draft.includes(category)
        ? current.draft.filter((item) => item !== category)
        : [...current.draft, category],
    }))
    setVisibilitySaveStatus(null)
  }, [])

  const saveVisibilitySelection = useCallback((): void => {
    const saved = [...selection.draft]
    const persisted = writeCommunityWaypointVisibleCategories(saved)
    setSelection({ saved, draft: saved })
    setVisibilitySaveStatus(persisted
      ? 'Selection saved.'
      : 'Selection saved for this session only.')
  }, [selection.draft])

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
    draftVisibleCategories: selection.draft,
    hasPendingVisibilityChanges,
    visibilitySaveStatus,
    selectedWaypoint,
    toggleCategory,
    saveVisibilitySelection,
    showCategoryPanel,
    selectWaypoint,
    clearSelectedWaypoint,
    retry,
  }
}
