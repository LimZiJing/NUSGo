// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type {
  PersonalWaypointCategoryVisibilityStore,
  PersonalWaypointCategoryVisibilityWriteResult,
} from '../../../../domain/waypoints/personal/personal-waypoint-category-visibility-store'
import { usePersonalWaypointCategoryVisibility } from './use-personal-waypoint-category-visibility'

function createStore(
  initial: readonly string[] = [],
  writeResult: PersonalWaypointCategoryVisibilityWriteResult = { kind: 'saved' },
) {
  let hiddenCategories = initial
  const writes: string[][] = []
  const store: PersonalWaypointCategoryVisibilityStore = {
    read: () => ({ kind: 'ready', hiddenCategories }),
    write: (next) => {
      writes.push([...next])
      if (writeResult.kind === 'saved') hiddenCategories = [...next]
      return writeResult
    },
  }
  return { store, getHiddenCategories: () => hiddenCategories, writes }
}

describe('usePersonalWaypointCategoryVisibility', () => {
  it('keeps visibility changes as a draft until Done saves them', () => {
    const { store, getHiddenCategories, writes } = createStore(['Food & drink'])
    const { result } = renderHook(() => usePersonalWaypointCategoryVisibility(store))

    expect(result.current.hiddenCategories).toEqual(['Food & drink'])
    expect(result.current.draftHiddenCategories).toEqual(['Food & drink'])
    expect(result.current.pickerOpen).toBe(false)

    act(() => result.current.openPicker())
    act(() => result.current.setCategoryVisible('Rest spot', false))
    expect(result.current.hiddenCategories).toEqual(['Food & drink'])
    expect(result.current.draftHiddenCategories).toEqual(['Food & drink', 'Rest spot'])
    expect(getHiddenCategories()).toEqual(['Food & drink'])
    expect(writes).toEqual([])

    act(() => result.current.saveCategoryVisibilityChanges())
    expect(result.current.hiddenCategories).toEqual(['Food & drink', 'Rest spot'])
    expect(result.current.draftHiddenCategories).toEqual(['Food & drink', 'Rest spot'])
    expect(result.current.pickerOpen).toBe(false)
    expect(getHiddenCategories()).toEqual(['Food & drink', 'Rest spot'])
    expect(writes).toEqual([['Food & drink', 'Rest spot']])
  })

  it('preserves a pending draft when the picker is revisited and cancels it on Cancel', () => {
    const { store, getHiddenCategories } = createStore(['Food & drink'])
    const { result } = renderHook(() => usePersonalWaypointCategoryVisibility(store))

    act(() => result.current.openPicker())
    act(() => result.current.setCategoryVisible('Food & drink', true))
    act(() => result.current.setCategoryVisible('Rest spot', false))
    act(() => result.current.togglePicker())
    act(() => result.current.togglePicker())

    expect(result.current.draftHiddenCategories).toEqual(['Rest spot'])
    expect(getHiddenCategories()).toEqual(['Food & drink'])

    act(() => result.current.cancelCategoryVisibilityChanges())
    expect(result.current.hiddenCategories).toEqual(['Food & drink'])
    expect(result.current.draftHiddenCategories).toEqual(['Food & drink'])
    expect(result.current.pickerOpen).toBe(false)
    expect(getHiddenCategories()).toEqual(['Food & drink'])
  })

  it('clears the selected categories in the draft without changing saved visibility', () => {
    const { store, getHiddenCategories } = createStore(['Food & drink'])
    const { result } = renderHook(() => usePersonalWaypointCategoryVisibility(store))

    act(() => result.current.openPicker())
    act(() => result.current.clearCategoryVisibilityChanges(['Food & drink', 'Rest spot']))

    expect(result.current.draftHiddenCategories).toEqual(['Food & drink', 'Rest spot'])
    expect(result.current.hiddenCategories).toEqual(['Food & drink'])
    expect(getHiddenCategories()).toEqual(['Food & drink'])
  })

  it('restores hidden categories from storage and reports failed saves', () => {
    const { store } = createStore(
      ['Food & drink'],
      { kind: 'unavailable' },
    )
    const { result } = renderHook(() => usePersonalWaypointCategoryVisibility(store))

    expect(result.current.hiddenCategories).toEqual(['Food & drink'])
    act(() => result.current.openPicker())
    act(() => result.current.setCategoryVisible('Rest spot', false))
    act(() => result.current.saveCategoryVisibilityChanges())

    expect(result.current.hiddenCategories).toEqual(['Food & drink', 'Rest spot'])
    expect(result.current.status).toContain('could not be saved')
  })

  it('does not overwrite stored visibility when the latest settings cannot be read', () => {
    const { store, getHiddenCategories, writes } = createStore(['Food & drink'])
    const unreadableStore: PersonalWaypointCategoryVisibilityStore = {
      ...store,
      read: () => ({ kind: 'invalid' }),
    }
    const { result } = renderHook(() => usePersonalWaypointCategoryVisibility(unreadableStore))
    let saved = true
    act(() => { saved = result.current.setCategoryVisibleImmediately('Rest spot', false) })
    expect(saved).toBe(false)
    expect(getHiddenCategories()).toEqual(['Food & drink'])
    expect(writes).toEqual([])
    expect(result.current.status).toContain('could not be read')
  })

  it('preserves other staged changes when a category is saved immediately', () => {
    const { store, getHiddenCategories } = createStore([])
    const { result } = renderHook(() => usePersonalWaypointCategoryVisibility(store))
    act(() => result.current.openPicker())
    act(() => result.current.setCategoryVisible('Food & drink', false))
    act(() => result.current.setCategoryVisibleImmediately('Rest spot', false))
    expect(getHiddenCategories()).toEqual(['Rest spot'])
    expect(result.current.draftHiddenCategories).toEqual(['Food & drink', 'Rest spot'])
    act(() => result.current.saveCategoryVisibilityChanges())
    expect(getHiddenCategories()).toEqual(['Food & drink', 'Rest spot'])
  })

  it('keeps saved visibility unchanged and reports a failed immediate write', () => {
    const { store, getHiddenCategories, writes } = createStore(['Food & drink'], { kind: 'unavailable' })
    const { result } = renderHook(() => usePersonalWaypointCategoryVisibility(store))
    let saved = true
    act(() => { saved = result.current.setCategoryVisibleImmediately('Rest spot', false) })
    expect(saved).toBe(false)
    expect(getHiddenCategories()).toEqual(['Food & drink'])
    expect(writes).toEqual([['Food & drink', 'Rest spot']])
    expect(result.current.hiddenCategories).toEqual(['Food & drink'])
    expect(result.current.status).toContain('could not be saved')
  })
})
