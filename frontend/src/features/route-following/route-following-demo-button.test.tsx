// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BusRoute } from '@nusgo/shared/transit/types'
import { RouteFollowingDemoButton } from './route-following-demo-button'

afterEach(cleanup)

const route: BusRoute = {
  id: 'A1',
  name: 'A1',
  color: '#123456',
  stopIds: ['STOP-1', 'STOP-2'],
}

describe('RouteFollowingDemoButton', () => {
  it('starts, advances, and restarts the selected route demo', () => {
    const onDemo = vi.fn()
    const { rerender } = render(
      <RouteFollowingDemoButton
        route={route}
        activeRouteId={null}
        activeStopIndex={null}
        onDemo={onDemo}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start A1 demo' }))
    expect(onDemo).toHaveBeenLastCalledWith('A1')

    rerender(<RouteFollowingDemoButton route={route} activeRouteId="A1" activeStopIndex={0} onDemo={onDemo} />)
    expect(screen.getByRole('button', { name: 'Advance A1 demo' }).textContent).toBe('Next stop')

    rerender(<RouteFollowingDemoButton route={route} activeRouteId="A1" activeStopIndex={1} onDemo={onDemo} />)
    expect(screen.getByRole('button', { name: 'Restart A1 demo' }).textContent).toBe('Restart')
  })
})
