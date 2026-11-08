// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import type { RouteFollowingWorkflow } from './use-route-following'
import { RouteFollowingBar } from './route-following-bar'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const transitIndex = createTransitIndex(createValidTransitNetwork())
const route = transitIndex.routeById.get('A1')!
const stops = route.stopIds.flatMap((stopId) => {
  const stop = transitIndex.stopById.get(stopId)
  return stop ? [stop] : []
})

function createWorkflow(overrides: Partial<RouteFollowingWorkflow> = {}): RouteFollowingWorkflow {
  return {
    currentStop: null,
    dismissedStopIds: new Set(),
    suggestion: null,
    pendingRoute: null,
    pendingRouteSuggestion: null,
    activeRoute: null,
    activeStops: [],
    activeStartIndex: null,
    activeStopIndex: null,
    announcement: '',
    announcementRevision: 0,
    setCurrentStop: vi.fn(),
    clearCurrentStop: vi.fn(),
    confirmSuggestion: vi.fn(),
    dismissSuggestion: vi.fn(),
    requestFollowRoute: vi.fn(() => false),
    demoFollowRoute: vi.fn(),
    startAtStop: vi.fn(),
    cancelRouteStart: vi.fn(),
    stopFollowing: vi.fn(),
    ...overrides,
  }
}

function renderBar(workflow: RouteFollowingWorkflow, showDemo = false) {
  return render(
    <RouteFollowingBar
      workflow={workflow}
      selectedRoute={route}
      selectedRouteVisible
      stops={stops}
      showDemo={showDemo}
    />,
  )
}

describe('RouteFollowingBar', () => {
  it('starts following from the top bar when a route is selected', async () => {
    const user = userEvent.setup()
    const requestFollowRoute = vi.fn(() => false)
    renderBar(createWorkflow({ requestFollowRoute }))

    expect(screen.queryByRole('button', { name: 'Route following options' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Follow route A1 toward B' }))

    expect(requestFollowRoute).toHaveBeenCalledWith('A1')
  })

  it('lets the user choose a route start before following', async () => {
    const user = userEvent.setup()
    const startAtStop = vi.fn()
    renderBar(createWorkflow({ pendingRoute: route, startAtStop }))

    expect(screen.getByRole('button', { name: /Starting stop/ })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(startAtStop).toHaveBeenCalledWith('STOP-A')
  })

  it('restores focus to the follow control after cancelling route start', async () => {
    const user = userEvent.setup()
    const workflow = createWorkflow({ pendingRoute: route })
    const view = renderBar(workflow)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    view.rerender(
      <RouteFollowingBar
        workflow={{ ...workflow, pendingRoute: null }}
        selectedRoute={route}
        selectedRouteVisible
        stops={stops}
      />,
    )

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Follow route A1 toward B' }))
  })

  it('keeps change and stop actions in the compact bar while following', async () => {
    const user = userEvent.setup()
    const stopFollowing = vi.fn()
    renderBar(createWorkflow({
      currentStop: stops[0],
      activeRoute: route,
      activeStops: stops,
      activeStartIndex: 0,
      activeStopIndex: 0,
      stopFollowing,
    }))

    expect(screen.getByRole('button', { name: /Following route A1 toward B, current stop A/ })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Following route A1 toward B, current stop A/ }))
    expect(screen.queryByRole('button', { name: 'Clear stop' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Stop following' }))

    expect(stopFollowing).toHaveBeenCalledOnce()
  })

  it('shows progress updates briefly without leaving the bar expanded', () => {
    vi.useFakeTimers()
    const activeWorkflow = createWorkflow({
      currentStop: stops[0],
      activeRoute: route,
      activeStops: stops,
      activeStartIndex: 0,
      activeStopIndex: 0,
    })
    const { rerender, container } = renderBar(activeWorkflow)

    rerender(
      <RouteFollowingBar
        workflow={{ ...activeWorkflow, announcement: 'Demo · A1 · B', announcementRevision: 1 }}
        selectedRoute={route}
        selectedRouteVisible
        stops={stops}
      />,
    )
    const island = container.querySelector('.route-following-island') as HTMLElement
    expect(screen.getByText('Demo · A1 · B')).toBeTruthy()
    expect(island.getAttribute('data-expanded')).toBe('true')

    act(() => vi.advanceTimersByTime(3_000))

    expect(screen.queryByText('Demo · A1 · B')).toBeNull()
    expect(island.getAttribute('data-expanded')).toBeNull()
    expect(screen.getByRole('button', { name: /Following route A1 toward B, current stop A/ })).toBeTruthy()
  })

  it('places the simulated progress control inside route options, away from the route list', async () => {
    const user = userEvent.setup()
    const demoFollowRoute = vi.fn()
    const { container } = renderBar(createWorkflow({ demoFollowRoute }), true)

    await user.click(screen.getByRole('button', { name: 'Route following options' }))
    await user.click(screen.getByRole('button', { name: 'Start A1 demo' }))

    expect(demoFollowRoute).toHaveBeenCalledWith('A1')
    expect(container.querySelector('.explore-bus-route-list')).toBeNull()
  })
})
