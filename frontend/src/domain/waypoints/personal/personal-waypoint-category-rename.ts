import { updatePersonalWaypoint } from './update-personal-waypoint'
import type { PersonalWaypoint } from './personal-waypoint'

export interface PersonalWaypointCategoryRenameDependencies {
  readonly now: () => string
}

/**
 * Renames every place in one category. Categories are derived from waypoint text, so this only
 * rewrites the category field and keeps ids, notes, marker settings and timestamps' identity.
 *
 * When the destination name already exists the two categories merge: existing destination places
 * stay first, then the incoming places follow, each set keeping its own saved order. Returns null
 * when there is nothing to rename or a record fails validation, so the caller can report a problem
 * without writing.
 */
export function renamePersonalWaypointCategory(
  waypoints: readonly PersonalWaypoint[],
  from: string,
  to: string,
  dependencies: PersonalWaypointCategoryRenameDependencies,
): readonly PersonalWaypoint[] | null {
  const source = from.trim()
  const destination = to.trim()
  if (!source || !destination || source === destination) return null
  if (!waypoints.some(({ category }) => category === source)) return null

  const incoming = waypoints.filter(({ category }) => category === source)
  const converted: PersonalWaypoint[] = []
  for (const waypoint of incoming) {
    const updated = updatePersonalWaypoint(waypoint, { ...waypoint, category: destination }, dependencies)
    if (!updated.ok) return null
    converted.push(updated.waypoint)
  }

  const mergedCategory = waypoints.some(({ category }) => category === destination)
  if (!mergedCategory) {
    // A pure rename keeps every place exactly where it was in the flat order.
    const convertedById = new Map(converted.map((waypoint) => [waypoint.id, waypoint] as const))
    return waypoints.map((waypoint) => convertedById.get(waypoint.id) ?? waypoint)
  }

  // A merge replaces both category blocks with one contiguous run so destination places stay first.
  const next: PersonalWaypoint[] = []
  let emittedMerged = false
  for (const waypoint of waypoints) {
    if (waypoint.category === source) continue
    if (waypoint.category === destination) {
      if (!emittedMerged) {
        next.push(...waypoints.filter((item) => item.category === destination), ...converted)
        emittedMerged = true
      }
      continue
    }
    next.push(waypoint)
  }
  if (!emittedMerged) next.push(...converted)
  return next
}

/**
 * The merged category is visible when either source category was visible, and hidden only when
 * both were hidden. The old name no longer exists once the places move, so it leaves the hidden
 * list too.
 */
export function mergeCategoryVisibility(
  hiddenCategories: readonly string[],
  from: string,
  to: string,
): { readonly hiddenCategories: readonly string[]; readonly visibleAfter: boolean } {
  const hidden = new Set(hiddenCategories)
  const visibleAfter = !hidden.has(from) || !hidden.has(to)
  const next = hiddenCategories.filter((category) => category !== from && category !== to)
  if (!visibleAfter) next.push(to)
  return { hiddenCategories: next, visibleAfter }
}

export function categoryMergeConfirmation(visibleAfter: boolean): string {
  return visibleAfter ? 'Shown on map after merging' : 'Hidden on map after merging'
}
