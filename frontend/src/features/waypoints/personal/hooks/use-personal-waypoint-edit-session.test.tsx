// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import type {
  PersonalWaypointStore,
  PersonalWaypointStoreMutationResult,
  PersonalWaypointStoreReadResult,
  PersonalWaypointStoreRevision,
} from '../../../../domain/waypoints/personal/personal-waypoint-store'
import { usePersonalWaypointEditSession } from './use-personal-waypoint-edit-session'

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

const bench = createWaypoint(1, 'Bench', 'Rest spot')
const library = createWaypoint(2, 'Library', 'Study spot')

function createMutableStore(initial: readonly PersonalWaypoint[] = [bench, library]) {
  let waypoints = [...initial]
  let revision: PersonalWaypointStoreRevision | null = null
  const store: PersonalWaypointStore = {
    read: vi.fn((): PersonalWaypointStoreReadResult => ({
      kind: 'ready',
      waypoints,
      revision,
      rejectedRecords: { count: 0, issues: [] },
    })),
    replaceAll: vi.fn((
      next: readonly PersonalWaypoint[],
      expected: PersonalWaypointStoreRevision | null,
    ): PersonalWaypointStoreMutationResult => {
      if (expected !== revision) return { kind: 'conflict' }
      waypoints = [...next]
      revision = JSON.stringify(waypoints) as PersonalWaypointStoreRevision
      return { kind: 'saved', revision }
    }),
    clear: vi.fn(() => ({ kind: 'cleared' as const })),
  }
  return {
    store,
    getWaypoints: () => waypoints,
    /** Simulates another tab writing the same key. */
    writeElsewhere: (next: readonly PersonalWaypoint[]) => {
      waypoints = [...next]
      revision = JSON.stringify(waypoints) as PersonalWaypointStoreRevision
    },
  }
}

afterEach(cleanup)

describe('usePersonalWaypointEditSession', () => {
  it('writes nothing until commit, then writes once', () => {
    const { store, getWaypoints } = createMutableStore()
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    act(() => { result.current.begin() })
    act(() => { result.current.move(bench.id, 'Study spot') })

    // The pending change is visible to the UI but not to the store.
    expect(result.current.working?.map(({ category }) => category)).toEqual(['Study spot', 'Study spot'])
    expect(store.replaceAll).not.toHaveBeenCalled()
    expect(getWaypoints()).toEqual([bench, library])

    let outcome: unknown
    act(() => { outcome = result.current.commit() })

    expect(outcome).toMatchObject({ kind: 'saved' })
    expect(store.replaceAll).toHaveBeenCalledTimes(1)
    expect(getWaypoints().map(({ name, category }) => [name, category])).toEqual([
      ['Library', 'Study spot'],
      ['Bench', 'Study spot'],
    ])
    // The session closes once the single write lands.
    expect(result.current.editing).toBe(false)
  })

  it('discards every pending change on cancel without writing', () => {
    const { store, getWaypoints } = createMutableStore()
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    act(() => { result.current.begin() })
    act(() => { result.current.move(bench.id, 'Work') })
    act(() => { result.current.remove(library.id) })
    expect(result.current.changeSummary).toBe('1 place moved and 1 place removed')

    act(() => { result.current.cancel() })

    expect(store.replaceAll).not.toHaveBeenCalled()
    expect(getWaypoints()).toEqual([bench, library])
    expect(result.current.editing).toBe(false)
  })

  it('reports no change when nothing was edited, without writing', () => {
    const { store } = createMutableStore()
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    act(() => { result.current.begin() })
    let outcome: unknown
    act(() => { outcome = result.current.commit() })

    expect(outcome).toMatchObject({ kind: 'unchanged' })
    expect(store.replaceAll).not.toHaveBeenCalled()
  })

  it('stages a category rename instead of writing it', () => {
    const { store, getWaypoints } = createMutableStore()
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    act(() => { result.current.begin() })
    let staged: readonly PersonalWaypoint[] | null = null
    act(() => { staged = result.current.rename('Rest spot', 'Break spot') })

    // The screen shows the new name, and the store still holds the old one.
    expect(staged).not.toBeNull()
    expect(result.current.working?.map(({ category }) => category)).toEqual(['Break spot', 'Study spot'])
    expect(store.replaceAll).not.toHaveBeenCalled()
    expect(getWaypoints().map(({ category }) => category)).toEqual(['Rest spot', 'Study spot'])
    expect(result.current.changeSummary).toBe('1 category renamed')
  })

  it('writes the staged rename once, on commit', () => {
    const { store, getWaypoints } = createMutableStore()
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    act(() => { result.current.begin() })
    act(() => { result.current.rename('Rest spot', 'Break spot') })
    let outcome: unknown
    act(() => { outcome = result.current.commit() })

    expect(outcome).toMatchObject({ kind: 'saved' })
    expect(store.replaceAll).toHaveBeenCalledTimes(1)
    expect(getWaypoints().map(({ category }) => category)).toEqual(['Break spot', 'Study spot'])
  })

  it('drops a staged rename on cancel, like every other pending change', () => {
    const { store, getWaypoints } = createMutableStore()
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    act(() => { result.current.begin() })
    act(() => { result.current.rename('Rest spot', 'Break spot') })
    act(() => { result.current.cancel() })

    expect(store.replaceAll).not.toHaveBeenCalled()
    expect(getWaypoints().map(({ category }) => category)).toEqual(['Rest spot', 'Study spot'])
  })

  it('answers null when a rename would do nothing, so the caller can say so', () => {
    const { store } = createMutableStore()
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    act(() => { result.current.begin() })
    let staged: readonly PersonalWaypoint[] | null = null
    act(() => { staged = result.current.rename('Missing', 'Break spot') })

    expect(staged).toBeNull()
    expect(result.current.changeSummary).toBeNull()
  })

  it('exposes the staged renames so the caller can apply dependent changes', () => {
    const { store } = createMutableStore()
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    act(() => { result.current.begin() })
    act(() => { result.current.rename('Rest spot', 'Break spot') })

    expect(result.current.renames).toEqual([{ from: 'Rest spot', to: 'Break spot', merged: false }])
  })

  it('refuses to write and keeps the pending work when another tab changed the list', () => {
    const { store, getWaypoints, writeElsewhere } = createMutableStore()
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    act(() => { result.current.begin() })
    act(() => { result.current.move(bench.id, 'Study spot') })

    // Another tab writes the same key while this edit is open.
    writeElsewhere([bench, library, createWaypoint(3, 'Cafe', 'Rest spot')])

    let outcome: unknown
    act(() => { outcome = result.current.commit() })

    expect(outcome).toMatchObject({ kind: 'failed' })
    expect(store.replaceAll).not.toHaveBeenCalled()
    // The other tab's write survives untouched, and the pending edit is still there to review.
    expect(getWaypoints()).toHaveLength(3)
    expect(result.current.editing).toBe(true)
    expect(result.current.issue).toContain('another tab')
  })

  it('keeps the pending work when the write itself fails', () => {
    const { store } = createMutableStore()
    store.replaceAll = vi.fn((): PersonalWaypointStoreMutationResult => ({ kind: 'invalid', issues: [] }))
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    act(() => { result.current.begin() })
    act(() => { result.current.reorder(library.id, 0) })

    let outcome: unknown
    act(() => { outcome = result.current.commit() })

    expect(outcome).toMatchObject({ kind: 'failed' })
    expect(result.current.editing).toBe(true)
    expect(result.current.dirty).toBe(true)
    expect(result.current.issue).toContain('could not be safely updated')
  })

  it('does not begin editing when the saved data needs recovery', () => {
    const store: PersonalWaypointStore = {
      read: vi.fn((): PersonalWaypointStoreReadResult => ({
        kind: 'recovery-required',
        reason: 'malformed-data',
        revision: 'broken' as PersonalWaypointStoreRevision,
      })),
      replaceAll: vi.fn(),
      clear: vi.fn(),
    }
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    let blocked: string | null = null
    act(() => { blocked = result.current.begin() })

    expect(blocked).toContain('needs recovery')
    expect(result.current.editing).toBe(false)
    expect(store.replaceAll).not.toHaveBeenCalled()
  })

  it('keeps an emptied category available as a drop target', () => {
    const { store } = createMutableStore([bench])
    const { result } = renderHook(() => usePersonalWaypointEditSession(store))

    act(() => { result.current.begin() })
    act(() => { result.current.move(bench.id, 'Work') })

    // Rest spot has no places left in the working list, but it stays listed so the place can be
    // moved back into it before confirming.
    expect(result.current.working?.every(({ category }) => category === 'Work')).toBe(true)
    expect(result.current.categories).toEqual(['Rest spot', 'Work'])
  })
})
