import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'

// Insertion position within a category, derived from the pointer against visible row midpoints.
// Rows are passed in final order with the moved waypoint already excluded, so the count of
// midpoints above the pointer is exactly the insertion index.
export function resolveInsertionIndexFromPointer(
  rowMidpoints: readonly number[],
  pointerY: number,
): number {
  return rowMidpoints.filter((midpoint) => midpoint < pointerY).length
}

// Visible row midpoints for a category, excluding the dragged row. Returns null when the group
// has no measurable rows (collapsed heading, or only the dragged place), so the caller falls back
// to "append" for a heading drop or the library-projected index for a row drop.
export function visibleRowMidpoints(
  categoryWaypointIds: readonly string[],
  excludedWaypointId: string,
  handles: ReadonlyMap<string, HTMLButtonElement | null>,
): number[] | null {
  const midpoints: number[] = []
  for (const id of categoryWaypointIds) {
    if (id === excludedWaypointId) continue
    const row = handles.get(id)?.closest('li')
    if (!row) continue
    const rect = row.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    midpoints.push(rect.top + rect.height / 2)
  }
  return midpoints.length > 0 ? midpoints.sort((left, right) => left - right) : null
}

export function moveGroupedWaypointFromDrag({
  waypointId,
  targetId,
  sourceGroup,
  sourceIndex,
  targetGroup,
  targetIndex,
  resolvedIndex,
  waypoints,
  onMoveToPosition,
}: {
  readonly waypointId: string
  readonly targetId: string
  readonly sourceGroup?: string
  readonly sourceIndex?: number
  readonly targetGroup?: string
  readonly targetIndex?: number
  /** Pointer-derived index; authoritative when the destination rows are visible. */
  readonly resolvedIndex?: number
  readonly waypoints: readonly PersonalWaypoint[]
  readonly onMoveToPosition?: (waypointId: string, category: string, indexWithinCategory: number) => boolean
}): { readonly kind: 'moved' | 'unchanged' | 'failed' | 'invalid'; readonly category?: string; readonly index?: number } {
  const waypoint = waypoints.find(({ id }) => id === waypointId)
  if (!waypoint) return { kind: 'invalid' }
  const groupPrefix = 'personal-waypoint-category:'
  const targetCategory = targetId.startsWith(groupPrefix)
    ? decodeURIComponent(targetId.slice(groupPrefix.length))
    : targetGroup ?? sourceGroup
  const appendIndex = waypoints.filter(({ category, id }) => category === targetCategory && id !== waypointId).length
  // A collapsed heading has no visible rows, so its only meaning is "append".
  const insertionIndex = resolvedIndex ?? (targetId.startsWith(groupPrefix) ? appendIndex : targetIndex ?? sourceIndex)
  if (!targetCategory || !Number.isInteger(insertionIndex) || insertionIndex === undefined || insertionIndex < 0) return { kind: 'invalid' }
  const sourceGlobalIndex = waypoints.findIndex(({ id }) => id === waypointId)
  const originalCategoryIndex = waypoints.filter(({ category }, index) => category === waypoint.category && index < sourceGlobalIndex).length
  if (targetCategory === waypoint.category && insertionIndex === originalCategoryIndex) return { kind: 'unchanged', category: targetCategory, index: insertionIndex }
  return onMoveToPosition?.(waypointId, targetCategory, insertionIndex)
    ? { kind: 'moved', category: targetCategory, index: insertionIndex }
    : { kind: 'failed', category: targetCategory, index: insertionIndex }
}

// Reorders one waypoint within its category while every other category keeps its place. The
// grouped view derives each category's order from the flat saved order, so a flat reorder that
// crosses a group boundary changes nothing on screen. Returns a new array, or a copy of the input
// when the waypoint is not part of the scope.
export function reorderWithinCategory(
  flat: readonly PersonalWaypoint[],
  waypointId: string,
  category: string | undefined,
  withinIndex: number,
): PersonalWaypoint[] {
  const inScope = (waypoint: PersonalWaypoint): boolean => category === undefined || waypoint.category === category
  const memberIds = flat.filter(inScope).map(({ id }) => id)
  const from = memberIds.indexOf(waypointId)
  const next = [...flat]
  if (from < 0) return next
  const to = Math.max(0, Math.min(memberIds.length - 1, withinIndex))
  if (to === from) return next
  const [movedId] = memberIds.splice(from, 1)
  memberIds.splice(to, 0, movedId!)
  const byId = new Map(flat.map((waypoint) => [waypoint.id, waypoint] as const))
  let cursor = 0
  flat.forEach((waypoint, slot) => {
    if (!inScope(waypoint)) return
    next[slot] = byId.get(memberIds[cursor++]!)!
  })
  return next
}

// A destination row can be mounted but unreachable: dropping onto a collapsed category leaves the
// moved handle inside a `hidden` list, where `focus()` silently does nothing. `isConnected` alone
// therefore cannot tell whether focus will land.
export function isFocusReachable(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element?.isConnected && !element.closest('[hidden]') && !element.matches(':disabled'))
}
