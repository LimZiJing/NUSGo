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
  return { store, getWaypoints: () => waypoints }
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

    act(() => result.current.moveWaypoint(second.id, first.id))

    expect(getWaypoints().map(({ id }) => id)).toEqual([second.id, first.id])
    expect(result.current.readResult).toMatchObject({
      kind: 'ready',
      waypoints: [second, first],
    })

    act(() => result.current.removeWaypoint(first.id))

    expect(getWaypoints().map(({ id }) => id)).toEqual([second.id])
    expect(result.current.status).toContain('removed')
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
})
