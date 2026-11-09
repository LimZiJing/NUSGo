// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
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
    hereStopId: null,
    suggestion: null,
    arrivalPrompt: null,
    activeRoute: null,
    activeStops: [],
    activeStartIndex: null,
    activeStopIndex: null,
    announcement: '',
    announcementRevision: 0,
    confirmSuggestion: vi.fn(),
    dismissSuggestion: vi.fn(),
    followArrivalRoute: vi.fn(() => true),
    dismissArrivalPrompt: vi.fn(),
    demoFollowRoute: vi.fn(),
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
      showDemo={showDemo}
    />,
  )
}

describe('RouteFollowingBar', () => {
  it('does not show a route pill just because a route is selected', () => {
    renderBar(createWorkflow())

    expect(screen.queryByRole('region', { name: 'Route following' })).toBeNull()
    expect(screen.queryByRole('button', { name: /follow route/i })).toBeNull()
  })

  it('does not show a route pill for a Here stop until following starts', () => {
    renderBar(createWorkflow({ currentStop: stops[0], hereStopId: stops[0].id }))

    expect(screen.queryByRole('region', { name: 'Route following' })).toBeNull()
    expect(screen.queryByRole('button', { name: /follow route/i })).toBeNull()
  })

  it('offers only a compact Get off action in the expanded follow control', async () => {
    const user = userEvent.setup()
    const stopFollowing = vi.fn()
    renderBar(createWorkflow({
      currentStop: stops[0],
      hereStopId: stops[0].id,
      activeRoute: route,
      activeStops: stops,
      activeStartIndex: 0,
      activeStopIndex: 0,
      stopFollowing,
    }))

    const currentStopButton = screen.getByRole('button', { name: 'Following route A1, current stop A' })
    expect(currentStopButton.textContent).toContain('A')
    expect(currentStopButton.textContent).not.toContain('→')
    await user.click(currentStopButton)
    expect(screen.queryByRole('button', { name: 'Change current stop' })).toBeNull()
    const getOffButton = screen.getByRole('button', { name: 'Get off and stop following route' })
    expect(getOffButton.className).toContain('route-following-get-off')
    await user.click(getOffButton)

    expect(stopFollowing).toHaveBeenCalledOnce()
  })

  it('does not show progress announcements as unsolicited popups', () => {
    const activeWorkflow = createWorkflow({
      currentStop: stops[0],
      hereStopId: stops[0].id,
      activeRoute: route,
      activeStops: stops,
      activeStartIndex: 0,
      activeStopIndex: 0,
    })
    const { container } = renderBar({ ...activeWorkflow, announcement: 'Demo · A1 · B', announcementRevision: 1 })

    expect(screen.queryByText('Demo · A1 · B')).toBeNull()
    const island = container.querySelector('.route-following-island') as HTMLElement
    expect(island.getAttribute('data-expanded')).toBeNull()
    expect(screen.getByRole('button', { name: 'Following route A1, current stop A' })).toBeTruthy()
  })

  it('keeps the route demo control in development for manual progress checks', async () => {
    const user = userEvent.setup()
    const demoFollowRoute = vi.fn()
    const { container } = renderBar(createWorkflow({ demoFollowRoute }), true)

    await user.click(screen.getByRole('button', { name: 'Start A1 demo' }))

    expect(demoFollowRoute).toHaveBeenCalledWith('A1')
    expect(container.querySelector('.route-following-island')).toBeNull()
  })
})