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
}

describe('MobileStopsSheet', () => {
  it('offers an accessible grab handle to expand the map-based Stops sheet', async () => {
    const user = userEvent.setup()
    const onExpandedChange = vi.fn()
    const { rerender } = render(
      <MobileStopsSheet
        expanded={false}
        selectedStop={null}
        onExpandedChange={onExpandedChange}
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
    expect(onExpandedChange).toHaveBeenCalledWith(true)

    rerender(
      <MobileStopsSheet
        expanded
        selectedStop={null}
        onExpandedChange={onExpandedChange}
        onBackToStops={vi.fn()}
        onSelectOppositeStop={vi.fn()}
        onSelectRoute={vi.fn()}
        onNavigateToStop={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Collapse Stops panel' }).getAttribute('aria-expanded'))
      .toBe('true')
    expect(screen.getByText('Tap a shuttle stop on the map to view its details and route actions.'))
      .toBeTruthy()
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
    expect(screen.getByText('☆', { selector: '[aria-hidden="true"]' })).toBeTruthy()

    const content = screen.getByTestId('mobile-stop-detail')
    const order = ['University Hall', 'Navigate', 'Opposite stop']
    const contentText = content.textContent ?? ''
    expect(order.map((label) => contentText.indexOf(label))).toEqual(
      [...order].map((label) => contentText.indexOf(label)).sort((a, b) => a - b),
    )
    expect(within(screen.getByRole('list', { name: 'Bus timings' })).getAllByRole('listitem'))
      .toHaveLength(3)
    expect(container.querySelector('.mobile-stop-favorite')?.tagName).toBe('SPAN')
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
