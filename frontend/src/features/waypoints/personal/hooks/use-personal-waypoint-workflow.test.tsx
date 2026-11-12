// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  PersonalWaypointStore,
  PersonalWaypointStoreMutationResult,
  PersonalWaypointStoreReadResult,
  PersonalWaypointStoreRevision,
} from '../../../../domain/waypoints/personal/personal-waypoint-store'
import type { PersonalWaypoint } from '../../../../domain/waypoints/personal/personal-waypoint'
import { usePersonalWaypointWorkflow } from './use-personal-waypoint-workflow'

const readResult: PersonalWaypointStoreReadResult = {
  kind: 'ready',
  waypoints: [],
  revision: null,
  rejectedRecords: { count: 0, issues: [] },
}

function createStore(outcome: PersonalWaypointStoreMutationResult): PersonalWaypointStore {
  return {
    read: vi.fn(() => readResult),
    replaceAll: vi.fn(() => outcome),
    clear: vi.fn((): PersonalWaypointStoreMutationResult => ({ kind: 'cleared' })),
  }
}

function createWaypoint(id: number, name: string): PersonalWaypoint {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    name,
    category: 'Rest spot',
    coordinate: { longitude: 103.78, latitude: 1.29 },
    markerColor: 'blue',
    markerIcon: 'dot',
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  }
}

function createMutableStore(initialWaypoints: readonly PersonalWaypoint[] = []) {
  let waypoints = [...initialWaypoints]
  let revision: PersonalWaypointStoreRevision | null = null
  const store: PersonalWaypointStore = {
    read: vi.fn((): PersonalWaypointStoreReadResult => ({
      kind: 'ready',
      waypoints,
      revision,
      rejectedRecords: { count: 0, issues: [] },
    })),
    replaceAll: vi.fn((
      nextWaypoints: readonly PersonalWaypoint[],
      expectedRevision: PersonalWaypointStoreRevision | null,
    ): PersonalWaypointStoreMutationResult => {
      if (expectedRevision !== revision) return { kind: 'conflict' }
      waypoints = [...nextWaypoints]
      revision = JSON.stringify(waypoints) as PersonalWaypointStoreRevision
      return { kind: 'saved', revision }
    }),
    clear: vi.fn((expectedRevision: PersonalWaypointStoreRevision | null): PersonalWaypointStoreMutationResult => {
      if (expectedRevision !== revision) return { kind: 'conflict' }
      waypoints = []
      revision = null
      return { kind: 'cleared' }
    }),
  }
  return { store, getWaypoints: () => waypoints, replaceExternally: (next: readonly PersonalWaypoint[]) => { waypoints = [...next]; revision = JSON.stringify(waypoints) as PersonalWaypointStoreRevision } }
}

type WorkflowResult = ReturnType<typeof usePersonalWaypointWorkflow>

function fillValidDraft(result: { readonly current: WorkflowResult }): void {
  act(() => result.current.updateDraft({ name: 'Quiet bench', category: 'Study spot' }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('usePersonalWaypointWorkflow', () => {
  it('keeps the draft and reports a conflict when another tab changes the list', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '4a85589b-4941-4a85-8d47-7c46f5d47400' })
    const store = createStore({ kind: 'conflict' })
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))
    fillValidDraft(result)

    let saved = true
    act(() => { saved = result.current.save() })

    expect(saved).toBe(false)
    expect(result.current.status).toContain('changed in another tab')
    expect(result.current.draft.name).toBe('Quiet bench')
    expect(store.replaceAll).toHaveBeenCalledOnce()
  })

  it('keeps the draft and reports storage write failures', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '4a85589b-4941-4a85-8d47-7c46f5d47400' })
    const store = createStore({ kind: 'unavailable', operation: 'write' })
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))
    fillValidDraft(result)

    let saved = true
    act(() => { saved = result.current.save() })

    expect(saved).toBe(false)
    expect(result.current.status).toBe('The waypoint could not be saved. Your draft is still here.')
    expect(result.current.draft.name).toBe('Quiet bench')
    expect(store.replaceAll).toHaveBeenCalledOnce()
  })

  it('reports unavailable secure ID generation without attempting a write', () => {
    vi.stubGlobal('crypto', {})
    const store = createStore({ kind: 'unavailable', operation: 'write' })
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))
    fillValidDraft(result)

    let saved = true
    act(() => { saved = result.current.save() })

    expect(saved).toBe(false)
    expect(result.current.status).toBe('This browser cannot securely save a waypoint. Your draft is still here.')
    expect(store.replaceAll).not.toHaveBeenCalled()
  })

  it('persists reordered and removed waypoints through the versioned store', () => {
    const first = createWaypoint(1, 'First place')
    const second = createWaypoint(2, 'Second place')
    const { store, getWaypoints } = createMutableStore([first, second])
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    act(() => result.current.moveWaypoint(second.id, 0))

    expect(getWaypoints().map(({ id }) => id)).toEqual([second.id, first.id])
    expect(store.replaceAll).toHaveBeenCalledTimes(1)
    expect(result.current.readResult).toMatchObject({
      kind: 'ready',
      waypoints: [second, first],
    })

    act(() => result.current.removeWaypoint(first.id))

    expect(getWaypoints().map(({ id }) => id)).toEqual([second.id])
    expect(result.current.status).toContain('removed')
  })

  it('moves a waypoint across multiple rows with one write and skips a no-op', () => {
    const first = createWaypoint(1, 'First place')
    const second = createWaypoint(2, 'Second place')
    const third = createWaypoint(3, 'Third place')
    const fourth = createWaypoint(4, 'Fourth place')
    const { store, getWaypoints } = createMutableStore([first, second, third, fourth])
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    act(() => result.current.moveWaypoint(first.id, 3))

    expect(getWaypoints().map(({ id }) => id)).toEqual([second.id, third.id, fourth.id, first.id])
    expect(store.replaceAll).toHaveBeenCalledTimes(1)

    act(() => result.current.moveWaypoint(first.id, 3))

    expect(store.replaceAll).toHaveBeenCalledTimes(1)
  })

  it('moves a waypoint to a category and restores its original order with Undo', () => {
    const first = createWaypoint(1, 'First place')
    const moved = createWaypoint(2, 'Second place')
    const third = createWaypoint(3, 'Third place')
    const { store, getWaypoints } = createMutableStore([first, moved, third])
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    let succeeded = false
    act(() => { succeeded = result.current.moveWaypointToCategory(moved.id, 'Work') })
    expect(succeeded).toBe(true)
    expect(getWaypoints().map(({ id, category }) => [id, category])).toEqual([
      [first.id, 'Rest spot'], [third.id, 'Rest spot'], [moved.id, 'Work'],
    ])
    expect(result.current.status).toBe('Moved to Work.')

    act(() => { succeeded = result.current.undoMoveWaypoint() })
    expect(succeeded).toBe(true)
    expect(getWaypoints()).toEqual([first, moved, third])
  })
  it('inserts a waypoint at an exact category position and offers the shared Undo', () => {
    const first = createWaypoint(21, 'First place')
    const moved = createWaypoint(22, 'Moved place')
    const second = createWaypoint(23, 'Second place')
    const elsewhere = { ...createWaypoint(24, 'Elsewhere'), category: 'Work' }
    const { store, getWaypoints } = createMutableStore([first, moved, second, elsewhere])
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    let succeeded = false
    act(() => { succeeded = result.current.moveWaypointToPosition(moved.id, 'Rest spot', 0) })
    expect(succeeded).toBe(true)
    expect(getWaypoints().map(({ id }) => id)).toEqual([moved.id, first.id, second.id, elsewhere.id])
    expect(result.current.canUndoMove).toBe(true)

    act(() => { succeeded = result.current.undoMoveWaypoint() })
    expect(succeeded).toBe(true)
    expect(getWaypoints()).toEqual([first, moved, second, elsewhere])
  })
  it.each([
    { name: 'down within a category', waypointIndex: 0, category: 'Rest spot', index: 2, expected: ['Moved', 'Second', 'First', 'Elsewhere'] },
    { name: 'up within a category', waypointIndex: 2, category: 'Rest spot', index: 0, expected: ['Second', 'First', 'Moved', 'Elsewhere'] },
    { name: 'cross-category before a row', waypointIndex: 1, category: 'Work', index: 0, expected: ['First', 'Second', 'Moved', 'Elsewhere'] },
    { name: 'append to another category', waypointIndex: 0, category: 'Work', index: 1, expected: ['Moved', 'Second', 'Elsewhere', 'First'] },
  ])('persists $name and Undo restores the original order', ({ waypointIndex, category, index, expected }) => {
    const rest = [createWaypoint(31, 'First'), createWaypoint(32, 'Moved'), createWaypoint(33, 'Second')]
    const elsewhere = [{ ...createWaypoint(34, 'Elsewhere'), category: 'Work' }]
    const initial = [...rest, ...elsewhere]
    const movedId = rest[waypointIndex]!.id
    const { store, getWaypoints } = createMutableStore(initial)
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    let succeeded = false
    act(() => { succeeded = result.current.moveWaypointToPosition(movedId, category, index) })
    expect(succeeded).toBe(true)
    expect(getWaypoints().map(({ name }) => name)).toEqual(expected)
    act(() => { succeeded = result.current.undoMoveWaypoint() })
    expect(succeeded).toBe(true)
    expect(getWaypoints()).toEqual(initial)
  })
  it('keeps saved waypoints and reports failure when a category insertion cannot be persisted', () => {
    const moved = createWaypoint(25, 'Saved place')
    const { store, getWaypoints } = createMutableStore([moved])
    store.replaceAll = vi.fn(() => ({ kind: 'unavailable', operation: 'write' } as const))
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    let succeeded = true
    act(() => { succeeded = result.current.moveWaypointToPosition(moved.id, 'Work', 0) })

    expect(succeeded).toBe(false)
    expect(getWaypoints()).toEqual([moved])
    expect(result.current.statusKind).toBe('problem')
    expect(result.current.status).toContain('Saved data was not changed.')
    expect(result.current.canUndoMove).toBe(false)
  })
  it('does not report Undo success when persistence fails', () => {
    const moved = createWaypoint(12, 'Saved place')
    const { store, getWaypoints } = createMutableStore([moved])
    const save = store.replaceAll
    let writes = 0
    store.replaceAll = vi.fn((next, revision) => {
      writes += 1
      if (writes > 1) return { kind: 'unavailable', operation: 'write' } as const
      return save(next, revision)
    })
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))
    act(() => { result.current.moveWaypointToCategory(moved.id, 'Work') })
    let undone = true
    act(() => { undone = result.current.undoMoveWaypoint() })
    expect(undone).toBe(false)
    expect(getWaypoints()[0]?.category).toBe('Work')
    expect(result.current.statusKind).toBe('problem')
  })
  it('refuses Undo after a newer saved revision appears', () => {
    const moved = createWaypoint(13, 'Saved place')
    const { store, getWaypoints, replaceExternally } = createMutableStore([moved])
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))
    act(() => { result.current.moveWaypointToCategory(moved.id, 'Work') })
    const newer = { ...getWaypoints()[0]!, note: 'Edited elsewhere' }
    replaceExternally([newer])
    let undone = true
    act(() => { undone = result.current.undoMoveWaypoint() })
    expect(undone).toBe(false)
    expect(getWaypoints()).toEqual([newer])
  })
  it('saves waypoint edits while preserving the saved identity and creation time', () => {
    const original = createWaypoint(3, 'Quiet bench')
    const { store, getWaypoints } = createMutableStore([original])
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    act(() => result.current.startEdit(original))
    act(() => result.current.updateDraft({ name: 'Shaded bench', note: 'Near the garden' }))

    let saved = false
    act(() => { saved = result.current.save() })

    expect(saved).toBe(true)
    expect(getWaypoints()[0]).toMatchObject({
      id: original.id,
      name: 'Shaded bench',
      note: 'Near the garden',
      createdAt: original.createdAt,
    })
    expect(getWaypoints()[0]?.updatedAt).not.toBe(original.updatedAt)
    expect(result.current.editingWaypointId).toBeNull()
  })

  it('reloads a conflicting edit without discarding the unsaved draft', () => {
    const original = createWaypoint(4, 'Quiet bench')
    const latest = { ...original, name: 'Bench moved' }
    const oldRevision = 'old-revision' as PersonalWaypointStoreRevision
    const latestRevision = 'latest-revision' as PersonalWaypointStoreRevision
    let reads = 0
    const store: PersonalWaypointStore = {
      read: vi.fn((): PersonalWaypointStoreReadResult => {
        reads += 1
        const current = reads < 3 ? original : latest
        return {
          kind: 'ready',
          waypoints: [current],
          revision: reads < 3 ? oldRevision : latestRevision,
          rejectedRecords: { count: 0, issues: [] },
        }
      }),
      replaceAll: vi.fn((): PersonalWaypointStoreMutationResult => ({ kind: 'conflict' })),
      clear: vi.fn((): PersonalWaypointStoreMutationResult => ({ kind: 'cleared' })),
    }
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    act(() => result.current.startEdit(original))
    act(() => result.current.updateDraft({ name: 'My unsaved edit' }))

    let saved = true
    act(() => { saved = result.current.save() })

    expect(saved).toBe(false)
    expect(result.current.readResult).toMatchObject({ kind: 'ready', waypoints: [latest] })
    expect(result.current.draft.name).toBe('My unsaved edit')
    expect(result.current.editingWaypointId).toBe(original.id)
    expect(result.current.editConflict).toEqual({ revision: latestRevision, latestWaypoint: latest })
    expect(store.replaceAll).not.toHaveBeenCalled()
  })

  it('clears only Personal Waypoints after the caller confirms the action', () => {
    const waypoint = createWaypoint(1, 'Quiet bench')
    const { store, getWaypoints } = createMutableStore([waypoint])
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))
    let cleared = false

    act(() => { cleared = result.current.clearAll() })

    expect(cleared).toBe(true)
    expect(store.clear).toHaveBeenCalledOnce()
    expect(getWaypoints()).toEqual([])
    expect(result.current.status).toContain('cleared')
  })

  it('resets unreadable storage only through the explicit recovery action', () => {
    const revision = '{broken' as PersonalWaypointStoreRevision
    let reset = false
    const store: PersonalWaypointStore = {
      read: vi.fn((): PersonalWaypointStoreReadResult => reset ? readResult : ({
        kind: 'recovery-required',
        reason: 'malformed-data',
        revision,
      })),
      replaceAll: vi.fn((): PersonalWaypointStoreMutationResult => ({ kind: 'recovery-required' })),
      clear: vi.fn((expectedRevision): PersonalWaypointStoreMutationResult => {
        if (expectedRevision !== revision) return { kind: 'conflict' }
        reset = true
        return { kind: 'cleared' }
      }),
    }
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    let cleared = false
    act(() => { cleared = result.current.resetUnreadableData() })

    expect(cleared).toBe(true)
    expect(store.clear).toHaveBeenCalledWith(revision)
    expect(result.current.readResult).toEqual(readResult)
    expect(result.current.status).toContain('reset')
  })

  it('keeps readable waypoints when the user discards rejected records', () => {
    const readable = createWaypoint(5, 'Quiet bench')
    const revision = 'partial-records' as PersonalWaypointStoreRevision
    let discarded = false
    const partialResult: PersonalWaypointStoreReadResult = {
      kind: 'ready',
      waypoints: [readable],
      revision,
      rejectedRecords: {
        count: 1,
        issues: [{ field: 'id', index: 1, message: 'Must be a UUID.' }],
      },
    }
    const store: PersonalWaypointStore = {
      read: vi.fn((): PersonalWaypointStoreReadResult => discarded ? {
        ...partialResult,
        rejectedRecords: { count: 0, issues: [] },
      } : partialResult),
      replaceAll: vi.fn((
        waypoints: readonly PersonalWaypoint[],
        expectedRevision: PersonalWaypointStoreRevision | null,
      ): PersonalWaypointStoreMutationResult => {
        if (expectedRevision !== revision) return { kind: 'conflict' }
        expect(waypoints).toEqual([readable])
        discarded = true
        return { kind: 'saved', revision }
      }),
      clear: vi.fn((): PersonalWaypointStoreMutationResult => ({ kind: 'cleared' })),
    }
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    let saved = false
    act(() => { saved = result.current.discardRejectedRecords() })

    expect(saved).toBe(true)
    expect(result.current.readResult).toMatchObject({
      kind: 'ready',
      waypoints: [readable],
      rejectedRecords: { count: 0 },
    })
    expect(result.current.status).toContain('Readable waypoints were kept')
  })

  it('renames a category through the validated store in one write', () => {
    const alpha = { ...createWaypoint(61, 'Alpha place'), category: 'Alpha' }
    const work = { ...createWaypoint(62, 'Work place'), category: 'Work' }
    const { store, getWaypoints } = createMutableStore([alpha, work])
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    let outcome: ReturnType<typeof result.current.renameCategory> = { ok: false }
    act(() => { outcome = result.current.renameCategory('Alpha', 'Study place') })

    expect(outcome.ok).toBe(true)
    expect(store.replaceAll).toHaveBeenCalledTimes(1)
    expect(getWaypoints().map(({ category, name }) => `${name}:${category}`))
      .toEqual(['Alpha place:Study place', 'Work place:Work'])
    expect(result.current.status).toBe('Category renamed to Study place.')
  })

  it('appends incoming places after the existing destination places when merging', () => {
    const alphaOne = { ...createWaypoint(71, 'Alpha one'), category: 'Alpha' }
    const workOne = { ...createWaypoint(72, 'Work one'), category: 'Work' }
    const alphaTwo = { ...createWaypoint(73, 'Alpha two'), category: 'Alpha' }
    const workTwo = { ...createWaypoint(74, 'Work two'), category: 'Work' }
    const { store, getWaypoints } = createMutableStore([alphaOne, workOne, alphaTwo, workTwo])
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    let outcome: ReturnType<typeof result.current.renameCategory> = { ok: false }
    act(() => { outcome = result.current.renameCategory('Alpha', 'Work') })

    expect(outcome).toMatchObject({ ok: true, merged: true })
    expect(getWaypoints().filter(({ category }) => category === 'Work').map(({ name }) => name))
      .toEqual(['Work one', 'Work two', 'Alpha one', 'Alpha two'])
    // Identity survives, and the emptied category disappears.
    expect(new Set(getWaypoints().map(({ id }) => id)))
      .toEqual(new Set([alphaOne.id, workOne.id, alphaTwo.id, workTwo.id]))
    expect(getWaypoints().every(({ category }) => category === 'Work')).toBe(true)
    expect(result.current.status).toBe('Merged into Work.')
  })

  it('reports a persistence failure without claiming success', () => {
    const alpha = { ...createWaypoint(81, 'Alpha place'), category: 'Alpha' }
    const work = { ...createWaypoint(82, 'Work place'), category: 'Work' }
    const store: PersonalWaypointStore = {
      read: vi.fn((): PersonalWaypointStoreReadResult => ({
        kind: 'ready',
        waypoints: [alpha, work],
        revision: null,
        rejectedRecords: { count: 0, issues: [] },
      })),
      replaceAll: vi.fn((): PersonalWaypointStoreMutationResult => ({ kind: 'conflict' })),
      clear: vi.fn((): PersonalWaypointStoreMutationResult => ({ kind: 'cleared' })),
    }
    const { result } = renderHook(() => usePersonalWaypointWorkflow(store))

    let outcome: ReturnType<typeof result.current.renameCategory> = { ok: true, merged: false, visibleAfter: true }
    act(() => { outcome = result.current.renameCategory('Alpha', 'Work') })

    expect(outcome.ok).toBe(false)
    expect(result.current.statusKind).toBe('problem')
    expect(result.current.status).toContain('could not be merged')
  })
})
