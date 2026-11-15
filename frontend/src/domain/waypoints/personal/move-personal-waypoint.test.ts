import { describe, expect, it } from 'vitest'
import type { PersonalWaypoint } from './personal-waypoint'
import { movePersonalWaypointToCategory } from './move-personal-waypoint'

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

/** Categories in the order their places appear; this layer must not import the feature grouping. */
function categoriesInSavedOrder(waypoints: readonly PersonalWaypoint[]): readonly string[] {
  return [...new Set(waypoints.map(({ category }) => category))]
}

const now = { now: () => '2026-10-27T00:00:00.000Z' }

const collection = [
  createWaypoint(1, 'Bench', 'Rest spot'),
  createWaypoint(2, 'Library', 'Study spot'),
  createWaypoint(3, 'Cafe', 'Rest spot'),
  createWaypoint(4, 'Lab', 'Study spot'),
]

describe('movePersonalWaypointToCategory', () => {
  it('moves one place into an existing category and appends it there', () => {
    const next = movePersonalWaypointToCategory(collection, collection[0].id, 'Study spot', now)
    expect(next).not.toBeNull()
    if (!next) return

    // The destination keeps its own order and the newcomer lands last in it.
    expect(next.map(({ name }) => name)).toEqual(['Library', 'Cafe', 'Lab', 'Bench'])
    expect(next.find(({ name }) => name === 'Bench')?.category).toBe('Study spot')
    // Other places keep their saved order.
    expect(next.filter(({ name }) => name !== 'Bench').map(({ name }) => name))
      .toEqual(['Library', 'Cafe', 'Lab'])
  })

  it('creates a destination category simply by using a new name', () => {
    const next = movePersonalWaypointToCategory(collection, collection[3].id, 'Work', now)
    expect(next).not.toBeNull()
    if (!next) return

    expect(categoriesInSavedOrder(next)).toEqual(['Rest spot', 'Study spot', 'Work'])
    expect(next.filter(({ category }) => category === 'Work').map(({ name }) => name)).toEqual(['Lab'])
  })

  it('drops a source category that the move emptied', () => {
    const single = [createWaypoint(1, 'Only place', 'Lonely'), createWaypoint(2, 'Cafe', 'Rest spot')]
    const next = movePersonalWaypointToCategory(single, single[0].id, 'Rest spot', now)
    expect(next).not.toBeNull()
    if (!next) return

    expect(categoriesInSavedOrder(next)).toEqual(['Rest spot'])
    // No place still carries the emptied name, so the category cannot be derived any more.
    expect(next.some(({ category }) => category === 'Lonely')).toBe(false)
  })

  it('refreshes the modification time but keeps identity and creation time', () => {
    const next = movePersonalWaypointToCategory(collection, collection[0].id, 'Work', now)
    const moved = next?.find(({ id }) => id === collection[0].id)
    expect(moved?.id).toBe(collection[0].id)
    expect(moved?.createdAt).toBe(collection[0].createdAt)
    expect(moved?.updatedAt).toBe('2026-10-27T00:00:00.000Z')
  })

  it('trims the chosen category name', () => {
    const next = movePersonalWaypointToCategory(collection, collection[0].id, '  Work  ', now)
    expect(next?.find(({ id }) => id === collection[0].id)?.category).toBe('Work')
  })

  it('writes nothing when the place is unknown, the category is empty, or it is already there', () => {
    expect(movePersonalWaypointToCategory(collection, 'missing', 'Work', now)).toBeNull()
    expect(movePersonalWaypointToCategory(collection, collection[0].id, '   ', now)).toBeNull()
    expect(movePersonalWaypointToCategory(collection, collection[0].id, ' Rest spot ', now)).toBeNull()
    expect(movePersonalWaypointToCategory(collection, collection[0].id, 'x'.repeat(41), now)).toBeNull()
  })
})
