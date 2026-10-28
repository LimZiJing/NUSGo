// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PersonalWaypointCategoryVisibilityStore } from '../../../../domain/waypoints/personal/personal-waypoint-category-visibility-store'
import { usePersonalWaypointCategoryVisibility } from './use-personal-waypoint-category-visibility'

function createStore(initial: readonly string[] = []) {
  let hiddenCategories = initial
  const store: PersonalWaypointCategoryVisibilityStore = {
    read: () => ({ kind: 'ready', hiddenCategories }),
    write: (next) => {
      hiddenCategories = next
      return { kind: 'saved' }
    },
  }
  return { store, getHiddenCategories: () => hiddenCategories }
}

describe('usePersonalWaypointCategoryVisibility', () => {
  it('starts with every category visible, persists toggles, and restores all categories', () => {
    const { store, getHiddenCategories } = createStore()
    const { result } = renderHook(() => usePersonalWaypointCategoryVisibility(store))

    expect(result.current.hiddenCategories).toEqual([])
    act(() => result.current.setCategoryVisible('Rest spot', false))
    expect(result.current.hiddenCategories).toEqual(['Rest spot'])
    expect(getHiddenCategories()).toEqual(['Rest spot'])

    act(() => result.current.setCategoryVisible('Food & drink', false))
    act(() => result.current.setCategoryVisible('Rest spot', true))
    expect(result.current.hiddenCategories).toEqual(['Food & drink'])

    act(() => result.current.showAllCategories())
    expect(result.current.hiddenCategories).toEqual([])
    expect(getHiddenCategories()).toEqual([])
  })

  it('restores hidden categories from browser-profile storage', () => {
    const { store } = createStore(['Food & drink'])
    const { result } = renderHook(() => usePersonalWaypointCategoryVisibility(store))

    expect(result.current.hiddenCategories).toEqual(['Food & drink'])
  })
})
