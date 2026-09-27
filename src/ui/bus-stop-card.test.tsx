// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BusStopCard } from './bus-stop-card'

afterEach(cleanup)

const cardProps = {
  stopId: 'STOP-A',
  stopName: 'Central Library',
  distanceMeters: 320,
  favorite: false,
  expanded: true,
  departures: [
    { routeId: 'A1', routeName: 'A1', routeColor: '#0b7258', timings: ['Arr', '8m', '17m'] as const },
  ],
  publicServices: [
    { serviceNumber: '95', timings: ['8m', '17m', '26m'] as const },
  ],
}

describe('BusStopCard', () => {
  it('exposes separate title-bar, favourite, and route actions', async () => {
    const user = userEvent.setup()
    const onToggleExpanded = vi.fn()
    const onToggleFavorite = vi.fn()
    const onSelectRoute = vi.fn()
    render(<BusStopCard
      {...cardProps}
      onToggleExpanded={onToggleExpanded}
      onToggleFavorite={onToggleFavorite}
      onSelectRoute={onSelectRoute}
    />)

    const titleBar = screen.getByRole('button', { name: 'Collapse Central Library bus timings' })
    const star = screen.getByRole('button', { name: 'Add Central Library to favourites' })
    expect(titleBar.getAttribute('aria-expanded')).toBe('true')
    expect(star.getAttribute('aria-pressed')).toBe('false')
    expect(within(titleBar).getByText('320m')).toBeTruthy()
    expect(within(titleBar).getByText('LIVE')).toBeTruthy()
    await user.click(within(titleBar).getByText('Central Library'))
    await user.click(star)
    await user.click(screen.getByRole('button', { name: 'View A1 route details' }))

    expect(onToggleExpanded).toHaveBeenCalledExactlyOnceWith('STOP-A')
    expect(onToggleFavorite).toHaveBeenCalledExactlyOnceWith('STOP-A')
    expect(onSelectRoute).toHaveBeenCalledExactlyOnceWith('A1')
    expect(screen.queryByRole('button', { name: /View 95 route details/ })).toBeNull()
  })

  it('keeps closed route controls inert and hides the LIVE pill', () => {
    const { container } = render(<BusStopCard
      {...cardProps}
      expanded={false}
      favorite
      distanceMeters={null}
      onToggleExpanded={vi.fn()}
      onToggleFavorite={vi.fn()}
      onSelectRoute={vi.fn()}
    />)

    expect(screen.getByRole('button', { name: 'Expand Central Library bus timings' }).getAttribute('aria-expanded'))
      .toBe('false')
    expect(screen.getByRole('button', { name: 'Remove Central Library from favourites' }).getAttribute('aria-pressed'))
      .toBe('true')
    expect(container.querySelector('.bus-stop-card-timings')?.hasAttribute('inert')).toBe(true)
    expect(screen.queryByText('LIVE')).toBeNull()
    expect(screen.queryByText('320m')).toBeNull()
    expect(screen.queryByRole('button', { name: 'View A1 route details' })).toBeNull()
  })
})
