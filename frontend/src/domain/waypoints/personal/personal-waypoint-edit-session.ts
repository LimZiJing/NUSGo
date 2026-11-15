import { PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH, type PersonalWaypoint } from './personal-waypoint'

/**
 * A pending set of changes to the saved collection, held in memory until the person confirms.
 *
 * Every list action — reordering, moving between categories, removing — edits this session rather
 * than the store, so the saved data is untouched until one single write at the end. Cancelling is
 * therefore free: nothing was written, and the baseline is still exactly what is stored.
 *
 * Categories are derived from the places, so the session also remembers the categories that
 * existed before the edit. That keeps a group visible after its last place is moved or removed,
 * which is what makes it a valid drop target for a place you want to move back in.
 */
export interface PersonalWaypointEditSession {
  /** The stored collection at the moment editing started, in its saved order. */
  readonly baseline: readonly PersonalWaypoint[]
  /** The working collection: the saved order with pending moves, reorders and removals applied. */
  readonly working: readonly PersonalWaypoint[]
  /** Ids removed in this session. They stay out of `working` but return if the edit is cancelled. */
  readonly removedIds: ReadonlySet<string>
}

export interface PersonalWaypointEditSummary {
  readonly movedCount: number
  readonly removedCount: number
  readonly reordered: boolean
  readonly total: number
}

export function createPersonalWaypointEditSession(
  baseline: readonly PersonalWaypoint[],
): PersonalWaypointEditSession {
  return { baseline, working: baseline, removedIds: new Set() }
}

/** Every category that existed when editing began, so an emptied group can stay on screen. */
export function sessionCategories(session: PersonalWaypointEditSession): readonly string[] {
  const names = new Set<string>()
  for (const waypoint of session.baseline) names.add(waypoint.category.trim())
  for (const waypoint of session.working) names.add(waypoint.category.trim())
  return [...names].sort((left, right) => left.localeCompare(right))
}

/**
 * Moves one place into another category, appending it so every other place keeps its order. The
 * category is created by using its name, as it is everywhere else: there is no separate record.
 * Returns the session unchanged when the request would do nothing.
 */
export function moveInSession(
  session: PersonalWaypointEditSession,
  waypointId: string,
  category: string,
  now: () => string,
): PersonalWaypointEditSession {
  const destination = category.trim()
  const waypoint = session.working.find(({ id }) => id === waypointId)
  if (!waypoint || !destination) return session
  if (destination.length > PERSONAL_WAYPOINT_CATEGORY_MAX_LENGTH) return session
  if (waypoint.category.trim() === destination) return session

  const moved: PersonalWaypoint = { ...waypoint, category: destination, updatedAt: now() }
  return {
    ...session,
    working: [...session.working.filter(({ id }) => id !== waypointId), moved],
  }
}

/**
 * Reorders a place to a flat index in the working collection. Because the list renders grouped by
 * category while the saved order is flat, the caller resolves the destination index first.
 */
export function reorderInSession(
  session: PersonalWaypointEditSession,
  waypointId: string,
  targetIndex: number,
): PersonalWaypointEditSession {
  const from = session.working.findIndex(({ id }) => id === waypointId)
  if (from < 0 || targetIndex < 0 || targetIndex >= session.working.length || from === targetIndex) {
    return session
  }

  const next = [...session.working]
  const [moved] = next.splice(from, 1)
  next.splice(targetIndex, 0, moved)
  return { ...session, working: next }
}

/** Removes a place from the pending collection, remembering it so Cancel can bring it back. */
export function removeInSession(
  session: PersonalWaypointEditSession,
  waypointId: string,
): PersonalWaypointEditSession {
  const waypoint = session.working.find(({ id }) => id === waypointId)
  if (!waypoint) return session
  const removedIds = new Set(session.removedIds)
  removedIds.add(waypointId)
  return {
    ...session,
    working: session.working.filter(({ id }) => id !== waypointId),
    removedIds,
  }
}

/**
 * Whether confirming would write anything. Compares identity rather than deep equality: every
 * operation above creates new records, so a reorder or category change shows up as a changed list.
 */
export function isSessionDirty(session: PersonalWaypointEditSession): boolean {
  if (session.removedIds.size > 0) return true
  if (session.working.length !== session.baseline.length) return true
  return session.working.some((waypoint, index) => waypoint !== session.baseline[index])
}

/**
 * What confirming will do, for the Cancel confirmation and the screen reader announcement. Counts
 * the places whose category changed, so "moved" is never claimed when only the order changed.
 */
export function summariseSession(session: PersonalWaypointEditSession): PersonalWaypointEditSummary {
  const baselineCategories = new Map(session.baseline.map(({ id, category }) => [id, category] as const))
  let movedCount = 0
  for (const waypoint of session.working) {
    const before = baselineCategories.get(waypoint.id)
    if (before !== undefined && before !== waypoint.category) movedCount += 1
  }

  const workingOrder = session.working.map(({ id }) => id)
  const survivingBaselineOrder = session.baseline
    .filter(({ id }) => !session.removedIds.has(id))
    .map(({ id }) => id)

  return {
    movedCount,
    removedCount: session.removedIds.size,
    // Moved places are appended, which changes the flat order too; only count a pure reorder when
    // the set of places and their categories are untouched.
    reordered: movedCount === 0 && session.removedIds.size === 0
      && workingOrder.some((id, index) => id !== survivingBaselineOrder[index]),
    total: session.baseline.length,
  }
}

/** One sentence for the Cancel confirmation, or null when there is nothing to discard. */
export function sessionChangeSummary(summary: PersonalWaypointEditSummary): string | null {
  if (!summary.reordered && summary.movedCount === 0 && summary.removedCount === 0) return null

  const parts: string[] = []
  if (summary.movedCount > 0) {
    parts.push(`${summary.movedCount} ${summary.movedCount === 1 ? 'place' : 'places'} moved`)
  }
  if (summary.removedCount > 0) {
    parts.push(`${summary.removedCount} ${summary.removedCount === 1 ? 'place' : 'places'} removed`)
  }
  if (summary.reordered) parts.push('order changed')

  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  return list.charAt(0).toUpperCase() + list.slice(1)
}
