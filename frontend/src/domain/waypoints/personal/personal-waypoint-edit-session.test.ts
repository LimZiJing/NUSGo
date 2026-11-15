import { describe, expect, it } from 'vitest'
import type { PersonalWaypoint } from './personal-waypoint'
import {
  createPersonalWaypointEditSession,
  isSessionDirty,
  moveInSession,
  removeInSession,
  reorderInSession,
  sessionCategories,
  sessionChangeSummary,
  summariseSession,
} from './personal-waypoint-edit-session'

function createWaypoint(id: number, name: string, category: string): PersonalWaypoint {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    name,
    category,
    coordinate: { longitude: 103.78, latitude: 1.29 },
    markerColor: 'blue',
    markerIcon: 'dot',
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  }
}

const now = (): string => '2026-10-27T00:00:00.000Z'

const bench = createWaypoint(1, 'Bench', 'Rest spot')
const library = createWaypoint(2, 'Library', 'Study spot')
const cafe = createWaypoint(3, 'Cafe', 'Rest spot')

const baseline = [bench, library, cafe]

describe('personal waypoint edit session', () => {
  it('starts clean and identical to the stored collection', () => {
    const session = createPersonalWaypointEditSession(baseline)
    expect(session.working).toBe(baseline)
    expect(isSessionDirty(session)).toBe(false)
    expect(sessionChangeSummary(summariseSession(session))).toBeNull()
  })

  it('moves a place to another category without touching the baseline', () => {
    const session = moveInSession(createPersonalWaypointEditSession(baseline), bench.id, 'Study spot', now)

    expect(session.working.map(({ name, category }) => [name, category])).toEqual([
      ['Library', 'Study spot'],
      ['Cafe', 'Rest spot'],
      ['Bench', 'Study spot'],
    ])
    // The saved collection is untouched: nothing is written until the person confirms.
    expect(session.baseline).toBe(baseline)
    expect(baseline.every((waypoint) => waypoint === session.baseline[baseline.indexOf(waypoint)])).toBe(true)
    expect(isSessionDirty(session)).toBe(true)
  })

  it('creates a destination category simply by naming it', () => {
    const session = moveInSession(createPersonalWaypointEditSession(baseline), cafe.id, 'Work', now)
    expect(sessionCategories(session)).toContain('Work')
    expect(session.working.find(({ id }) => id === cafe.id)?.category).toBe('Work')
  })

  it('ignores a move that would do nothing', () => {
    const session = createPersonalWaypointEditSession(baseline)
    expect(moveInSession(session, bench.id, ' Rest spot ', now)).toBe(session)
    expect(moveInSession(session, 'missing', 'Work', now)).toBe(session)
    expect(moveInSession(session, bench.id, '   ', now)).toBe(session)
    expect(moveInSession(session, bench.id, 'x'.repeat(41), now)).toBe(session)
    expect(isSessionDirty(session)).toBe(false)
  })

  it('keeps an emptied category listed so it stays a drop target', () => {
    const session = moveInSession(createPersonalWaypointEditSession(baseline), cafe.id, 'Study spot', now)
    // Rest spot still has Bench; move that too and the group would otherwise vanish.
    const emptied = moveInSession(session, bench.id, 'Study spot', now)
    expect(emptied.working.every(({ category }) => category === 'Study spot')).toBe(true)
    // The category survived because the session remembers the categories that existed.
    expect(sessionCategories(emptied)).toContain('Rest spot')
  })

  it('removes a place but keeps it recoverable until confirmed', () => {
    const session = removeInSession(createPersonalWaypointEditSession(baseline), library.id)
    expect(session.working.map(({ name }) => name)).toEqual(['Bench', 'Cafe'])
    expect(session.removedIds.has(library.id)).toBe(true)
    expect(session.baseline).toHaveLength(3)
    expect(summariseSession(session).removedCount).toBe(1)
  })

  it('reorders within the working collection', () => {
    const session = reorderInSession(createPersonalWaypointEditSession(baseline), bench.id, 2)
    expect(session.working.map(({ name }) => name)).toEqual(['Library', 'Cafe', 'Bench'])
    expect(isSessionDirty(session)).toBe(true)
  })

  it('treats a reorder to the same position as no change', () => {
    const session = createPersonalWaypointEditSession(baseline)
    expect(reorderInSession(session, bench.id, 0)).toBe(session)
    expect(isSessionDirty(session)).toBe(false)
  })

  it('summarises moves, removals and pure reorders distinctly', () => {
    const moved = moveInSession(createPersonalWaypointEditSession(baseline), bench.id, 'Work', now)
    expect(summariseSession(moved)).toMatchObject({ movedCount: 1, removedCount: 0, reordered: false })
    expect(sessionChangeSummary(summariseSession(moved))).toBe('1 place moved')

    const removed = removeInSession(createPersonalWaypointEditSession(baseline), bench.id)
    expect(sessionChangeSummary(summariseSession(removed))).toBe('1 place removed')

    const reordered = reorderInSession(createPersonalWaypointEditSession(baseline), cafe.id, 0)
    expect(summariseSession(reordered)).toMatchObject({ movedCount: 0, reordered: true })
    expect(sessionChangeSummary(summariseSession(reordered))).toBe('Order changed')
  })

  it('joins several kinds of change into one sentence', () => {
    const moved = moveInSession(createPersonalWaypointEditSession(baseline), bench.id, 'Work', now)
    const both = removeInSession(moved, library.id)
    expect(sessionChangeSummary(summariseSession(both))).toBe('1 place moved and 1 place removed')
  })
})
