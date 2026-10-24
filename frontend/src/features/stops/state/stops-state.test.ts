import { describe, expect, it } from 'vitest'
import { createInitialStopsState, stopsReducer } from './stops-state'

describe('Stops state', () => {
  it('keeps a focused stop until Back to stops is explicitly selected', () => {
    const focused = stopsReducer(createInitialStopsState(), {
      type: 'focus-stop',
      stopId: 'SR7',
    })

    expect(focused.focusedStopId).toBe('SR7')
    expect(stopsReducer(focused, { type: 'back-to-stops' }).focusedStopId).toBeNull()
  })

  it('keeps list, expansion, and favourites state until canonical stops are reconciled', () => {
    const initial = createInitialStopsState(['STOP-A', 'missing'])
    const favourites = stopsReducer(initial, { type: 'select-list', list: 'favourites' })
    const expanded = stopsReducer(favourites, { type: 'toggle-expanded', stopId: 'STOP-A' })
    const focused = stopsReducer(expanded, { type: 'focus-stop', stopId: 'STOP-A' })

    expect(focused.list).toBe('favourites')
    expect(focused.expandedStopIds).toEqual({ nearby: [], favourites: ['STOP-A'] })
    expect(focused.favoriteStopIds).toEqual(['STOP-A', 'missing'])

    const reconciled = stopsReducer(focused, {
      type: 'reconcile-stops',
      stopIds: new Set(['STOP-A']),
    })
    expect(reconciled.favoriteStopIds).toEqual(['STOP-A'])
    expect(reconciled.expandedStopIds).toEqual({ nearby: [], favourites: ['STOP-A'] })
    expect(reconciled.focusedStopId).toBe('STOP-A')
    expect(stopsReducer(reconciled, { type: 'toggle-expanded', stopId: 'STOP-A' })
      .expandedStopIds).toEqual({ nearby: [], favourites: [] })
  })

  it('starts timings closed and replaces Nearby expansion without expanding Favourites', () => {
    const initial = createInitialStopsState()

    expect(initial.expandedStopIds).toEqual({ nearby: [], favourites: [] })

    const nearbyExpanded = stopsReducer(initial, {
      type: 'set-nearby-expanded',
      stopIds: ['STOP-A', 'STOP-B'],
    })

    expect(nearbyExpanded.expandedStopIds).toEqual({
      nearby: ['STOP-A', 'STOP-B'],
      favourites: [],
    })

    const nearbyReplaced = stopsReducer(nearbyExpanded, {
      type: 'set-nearby-expanded',
      stopIds: ['STOP-B'],
    })

    expect(nearbyReplaced.expandedStopIds).toEqual({
      nearby: ['STOP-B'],
      favourites: [],
    })

    const favouritesExpanded = stopsReducer(
      stopsReducer(nearbyReplaced, { type: 'select-list', list: 'favourites' }),
      { type: 'toggle-expanded', stopId: 'STOP-A' },
    )

    expect(favouritesExpanded.expandedStopIds).toEqual({
      nearby: ['STOP-B'],
      favourites: ['STOP-A'],
    })

    const nearbyAutoExpanded = stopsReducer(favouritesExpanded, {
      type: 'set-nearby-expanded',
      stopIds: ['STOP-B'],
    })

    expect(nearbyAutoExpanded.expandedStopIds).toEqual({
      nearby: ['STOP-B'],
      favourites: ['STOP-A'],
    })
  })

  it('removes one favourite or clears all without changing the selected Stops list', () => {
    const state = {
      ...createInitialStopsState(['STOP-A', 'STOP-B']),
      list: 'favourites' as const,
    }

    const oneRemoved = stopsReducer(state, { type: 'remove-favorite', stopId: 'STOP-A' })
    expect(oneRemoved.favoriteStopIds).toEqual(['STOP-B'])
    expect(oneRemoved.list).toBe('favourites')

    const allRemoved = stopsReducer(oneRemoved, { type: 'clear-favorites' })
    expect(allRemoved.favoriteStopIds).toEqual([])
    expect(allRemoved.list).toBe('favourites')
  })
})
