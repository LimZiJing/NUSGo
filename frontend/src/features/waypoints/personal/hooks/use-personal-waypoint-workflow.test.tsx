// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  PersonalWaypointStore,
  PersonalWaypointStoreMutationResult,
  PersonalWaypointStoreReadResult,
} from '../../../../domain/waypoints/personal/personal-waypoint-store'
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
})