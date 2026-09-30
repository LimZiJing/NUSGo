// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileStopsSheet } from './mobile-stops-sheet'
import type { MobileStopSheetSelection } from './mobile-stops-sheet'

afterEach(cleanup)

const selectedStop: MobileStopSheetSelection = {
  id: 'SR7',
  longName: 'University Hall',
  oppositeStop: { id: 'SR8', longName: 'University Hall (Opposite)' },
  publicServices: ['95'],
  departures: [
    { routeId: 'A1', routeName: 'A1', routeColor: '#0b7258', timings: ['Arr', '8m', '17m'] },
    { routeId: 'D2', routeName: 'D2', routeColor: '#6e1d72', timings: ['4m', '12m', '-'] },
  ],
  scheduledDepartures: [],
  live: true,
  liveArrivalMessage: null,
}

describe('MobileStopsSheet', () => {
  it('offers an accessible grab handle to expand the map-based Stops sheet', async () => {
    const user = userEvent.setup()
    const onDetentChange = vi.fn()
    const { rerender } = render(
      <MobileStopsSheet
        detent="collapsed"
        selectedStop={null}
        onDetentChange={onDetentChange}
        onBackToStops={vi.fn()}
        onSelectOppositeStop={vi.fn()}
        onSelectRoute={vi.fn()}
        onNavigateToStop={vi.fn()}
      />,
    )

    const toggle = screen.getByRole('button', { name: 'Expand Stops panel' })
    expect(toggle.getAttribute('aria-controls')).toBe('mobile-stops-sheet-content')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await user.click(toggle)
    expect(onDetentChange).toHaveBeenCalledWith('partial')

    rerender(
      <MobileStopsSheet
        detent="full"
        selectedStop={null}
        onDetentChange={onDetentChange}
        onBackToStops={vi.fn()}
        onSelectOppositeStop={vi.fn()}
        onSelectRoute={vi.fn()}
        onNavigateToStop={vi.fn()}
      />,
    )
    const fullToggle = screen.getByRole('button', { name: 'Collapse Stops panel' })
    expect(fullToggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Tap a shuttle stop on the map to view its details and route actions.'))
      .toBeTruthy()
    await user.click(fullToggle)
    expect(onDetentChange).toHaveBeenLastCalledWith('collapsed')
  })

  it('orders stop identity, destination action, routes, public services and departures', () => {
    const { container } = render(
      <MobileStopsSheet
        expanded
        selectedStop={selectedStop}
        onExpandedChange={vi.fn()}
        onBackToStops={vi.fn()}
        onSelectOppositeStop={vi.fn()}
        onSelectRoute={vi.fn()}
        onNavigateToStop={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Back to stops' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'University Hall' })).toBeTruthy()
    expect(screen.getByText('SR7')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add University Hall to favourites' }).getAttribute('aria-pressed'))
      .toBe('false')

    const content = screen.getByTestId('mobile-stop-detail')
    const order = ['University Hall', 'Navigate', 'Opposite stop']
    const contentText = content.textContent ?? ''
    expect(order.map((label) => contentText.indexOf(label))).toEqual(
      [...order].map((label) => contentText.indexOf(label)).sort((a, b) => a - b),
    )
    expect(within(screen.getByRole('list', { name: 'Bus timings' })).getAllByRole('listitem'))
      .toHaveLength(3)
    expect(screen.getByText('No live timing')).toBeTruthy()
    expect(screen.queryByText('26m')).toBeNull()
    expect(container.querySelector('.mobile-stop-favorite')?.tagName).toBe('BUTTON')
  })

  it('routes Back, opposite stop, route and destination actions through their callbacks', async () => {
    const user = userEvent.setup()
    const onBackToStops = vi.fn()
    const onSelectOppositeStop = vi.fn()
    const onSelectRoute = vi.fn()
    const onNavigateToStop = vi.fn()
    render(
      <MobileStopsSheet
        expanded
        selectedStop={selectedStop}
        onExpandedChange={vi.fn()}
        onBackToStops={onBackToStops}
        onSelectOppositeStop={onSelectOppositeStop}
        onSelectRoute={onSelectRoute}
        onNavigateToStop={onNavigateToStop}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Back to stops' }))
    await user.click(screen.getByRole('button', { name: 'View D2 route details' }))
    await user.click(screen.getByRole('button', { name: 'Navigate to this stop' }))
    await user.click(screen.getByRole('button', { name: /Opposite stop: University Hall \(Opposite\), SR8/ }))

    expect(onBackToStops).toHaveBeenCalledOnce()
    expect(onSelectRoute).toHaveBeenCalledWith('D2')
    expect(onNavigateToStop).toHaveBeenCalledWith('SR7')
    expect(onSelectOppositeStop).toHaveBeenCalledWith('SR8')
  })
})
