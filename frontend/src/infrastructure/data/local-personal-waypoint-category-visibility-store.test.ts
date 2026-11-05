import { describe, expect, it, vi } from 'vitest'
import {
  createLocalPersonalWaypointCategoryVisibilityStore,
  PERSONAL_WAYPOINT_CATEGORY_VISIBILITY_KEY,
} from './local-personal-waypoint-category-visibility-store'

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    values,
  }
}

describe('local Personal Waypoint category visibility store', () => {
  it('defaults missing preferences to all visible and persists hidden categories separately', () => {
    const storage = createStorage()
    const store = createLocalPersonalWaypointCategoryVisibilityStore(() => storage)

    expect(store.read()).toEqual({ kind: 'ready', hiddenCategories: [] })
    expect(store.write(['Rest spot', 'Rest spot'])).toEqual({ kind: 'saved' })
    expect(storage.values.get(PERSONAL_WAYPOINT_CATEGORY_VISIBILITY_KEY)).toBe(
      JSON.stringify({ version: 1, hiddenCategories: ['Rest spot'] }),
    )
    expect(store.read()).toEqual({ kind: 'ready', hiddenCategories: ['Rest spot'] })
  })

  it('fails open for malformed or unsupported preferences without touching waypoint storage', () => {
    const storage = createStorage({
      [PERSONAL_WAYPOINT_CATEGORY_VISIBILITY_KEY]: '{broken',
      'navus:personal-waypoints:v1': 'saved waypoints',
    })
    const store = createLocalPersonalWaypointCategoryVisibilityStore(() => storage)

    expect(store.read()).toEqual({ kind: 'invalid' })
    expect(storage.values.get('navus:personal-waypoints:v1')).toBe('saved waypoints')
  })

  it('reports browser storage failures', () => {
    const store = createLocalPersonalWaypointCategoryVisibilityStore(() => {
      throw new Error('storage unavailable')
    })

    expect(store.read()).toEqual({ kind: 'unavailable' })
    expect(store.write(['Rest spot'])).toEqual({ kind: 'unavailable' })
  })
})
