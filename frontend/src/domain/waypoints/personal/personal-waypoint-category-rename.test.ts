import { describe, expect, it } from 'vitest'
import type { PersonalWaypoint } from './personal-waypoint'
import {
  categoryMergeConfirmation,
  mergeCategoryVisibility,
  renamePersonalWaypointCategory,
} from './personal-waypoint-category-rename'

let nextId = 1
function createWaypoint(name: string, category: string, overrides: Partial<PersonalWaypoint> = {}): PersonalWaypoint {
  const suffix = String(nextId++).padStart(12, '0')
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    name,
    category,
    coordinate: { longitude: 103.78, latitude: 1.29 },
    markerColor: 'blue',
    markerIcon: 'dot',
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z',
    ...overrides,
  }
}

const now = { now: () => '2026-11-13T00:00:00.000Z' }
const names = (waypoints: readonly PersonalWaypoint[]): string[] => waypoints.map(({ name }) => name)
const categoriesIn = (waypoints: readonly PersonalWaypoint[], category: string): string[] =>
  waypoints.filter((item) => item.category === category).map(({ name }) => name)

describe('renamePersonalWaypointCategory', () => {
  it('renames a category in place without moving any place', () => {
    const waypoints = [
      createWaypoint('A1', 'Alpha'),
      createWaypoint('B1', 'Beta'),
      createWaypoint('A2', 'Alpha'),
    ]

    const next = renamePersonalWaypointCategory(waypoints, 'Alpha', 'Study place', now)!

    expect(names(next)).toEqual(['A1', 'B1', 'A2'])
    expect(categoriesIn(next, 'Study place')).toEqual(['A1', 'A2'])
    expect(categoriesIn(next, 'Alpha')).toEqual([])
    // Identity is preserved; only the category changes.
    expect(next[0]!.id).toBe(waypoints[0]!.id)
    expect(next[0]!.createdAt).toBe(waypoints[0]!.createdAt)
  })

  it('merges with destination places first, then incoming places in saved order', () => {
    const waypoints = [
      createWaypoint('A1', 'Alpha'),
      createWaypoint('W1', 'Work'),
      createWaypoint('A2', 'Alpha'),
      createWaypoint('W2', 'Work'),
    ]

    const next = renamePersonalWaypointCategory(waypoints, 'Alpha', 'Work', now)!

    expect(categoriesIn(next, 'Work')).toEqual(['W1', 'W2', 'A1', 'A2'])
    expect(categoriesIn(next, 'Alpha')).toEqual([])
    // Every waypoint survives with its original identity.
    expect(new Set(names(next))).toEqual(new Set(['A1', 'A2', 'W1', 'W2']))
    expect(next).toHaveLength(4)
  })

  it('keeps other categories in order and drops the emptied category', () => {
    const waypoints = [
      createWaypoint('A1', 'Alpha'),
      createWaypoint('G1', 'Gamma'),
      createWaypoint('W1', 'Work'),
    ]

    const next = renamePersonalWaypointCategory(waypoints, 'Alpha', 'Work', now)!

    expect(names(next)).toEqual(['G1', 'W1', 'A1'])
    expect(categoriesIn(next, 'Alpha')).toEqual([])
    expect(categoriesIn(next, 'Gamma')).toEqual(['G1'])
  })

  it('rejects a missing, blank, or unchanged name and leaves the caller to report it', () => {
    const waypoints = [createWaypoint('A1', 'Alpha')]
    expect(renamePersonalWaypointCategory(waypoints, 'Alpha', 'Alpha', now)).toBeNull()
    expect(renamePersonalWaypointCategory(waypoints, 'Alpha', '   ', now)).toBeNull()
    expect(renamePersonalWaypointCategory(waypoints, 'Missing', 'Work', now)).toBeNull()
  })

  it('trims the requested name before comparing', () => {
    const waypoints = [createWaypoint('A1', 'Alpha'), createWaypoint('W1', 'Work')]
    const next = renamePersonalWaypointCategory(waypoints, 'Alpha', '  Work  ', now)!
    expect(categoriesIn(next, 'Work')).toEqual(['W1', 'A1'])
  })

  it('preserves marker colours and icons through a merge', () => {
    const waypoints = [
      createWaypoint('A1', 'Alpha', { markerColor: 'purple', markerIcon: 'food' }),
      createWaypoint('W1', 'Work', { markerColor: 'green', markerIcon: 'nature' }),
    ]
    const next = renamePersonalWaypointCategory(waypoints, 'Alpha', 'Work', now)!
    expect(next.find(({ name }) => name === 'A1')).toMatchObject({ markerColor: 'purple', markerIcon: 'food' })
    expect(next.find(({ name }) => name === 'W1')).toMatchObject({ markerColor: 'green', markerIcon: 'nature' })
  })
})

describe('mergeCategoryVisibility', () => {
  it('is visible when either source category was visible', () => {
    expect(mergeCategoryVisibility([], 'Alpha', 'Work')).toEqual({ hiddenCategories: [], visibleAfter: true })
    expect(mergeCategoryVisibility(['Work'], 'Alpha', 'Work')).toEqual({ hiddenCategories: [], visibleAfter: true })
    expect(mergeCategoryVisibility(['Alpha'], 'Alpha', 'Work')).toEqual({ hiddenCategories: [], visibleAfter: true })
  })

  it('is hidden only when both source categories were hidden', () => {
    const result = mergeCategoryVisibility(['Alpha', 'Work'], 'Alpha', 'Work')
    expect(result.visibleAfter).toBe(false)
    expect(result.hiddenCategories).toEqual(['Work'])
  })

  it('drops the old name so the emptied category cannot linger in settings', () => {
    expect(mergeCategoryVisibility(['Alpha', 'Other'], 'Alpha', 'Work').hiddenCategories).toEqual(['Other'])
  })

  it('names the correct confirmation label', () => {
    expect(categoryMergeConfirmation(true)).toBe('Shown on map after merging')
    expect(categoryMergeConfirmation(false)).toBe('Hidden on map after merging')
  })
})
