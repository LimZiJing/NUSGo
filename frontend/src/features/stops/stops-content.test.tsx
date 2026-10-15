// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StopsContent } from './stops-content.tsx'
import type { StopDetailsModel } from './data/stop-details-model.ts'

afterEach(cleanup)

const selectedStop: StopDetailsModel = {
  id: 'SR7',
  longName: 'University Hall',
  oppositeStop: { id: 'SR8', longName: 'University Hall (Opposite)' },
  publicServices: [{ serviceNumber: '95', timings: null }],
  departures: [
    { routeId: 'A1', routeName: 'A1', routeColor: '#0b7258', timings: ['Arr', '8m', '17m'] },
    { routeId: 'D2', routeName: 'D2', routeColor: '#6e1d72', timings: ['4m', '12m', '-'] },
  ],
  scheduledDepartures: [],
  live: true,
  liveArrivalMessage: null,
}

describe('StopsContent', () => {
  it('orders stop identity, destination action, routes, public services and departures', () => {
    const { container } = render(
      <StopsContent
        selectedStop={selectedStop}
        onBackToStops={vi.fn()}
        onSelectOppositeStop={vi.fn()}
        onSelectRoute={vi.fn()}
        onNavigateToStop={vi.fn()}
        onSelectStopList={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleExpanded={vi.fn()}
        onDismissLocationNotice={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Back to stops' })).toBeTruthy()
    const stopHeading = screen.getByRole('heading', { name: 'University Hall, bus stop' })
    expect(stopHeading.querySelector('.location-identity-icon--stop[aria-hidden="true"]')).toBeTruthy()
    expect(screen.getByText('SR7')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add University Hall, bus stop to favourites' }).getAttribute('aria-pressed'))
      .toBe('false')

    const content = screen.getByTestId('stop-detail')
    const order = ['University Hall', 'Navigate', 'Opposite stop']
    const contentText = content.textContent ?? ''
    expect(order.map((label) => contentText.indexOf(label))).toEqual(
      [...order].map((label) => contentText.indexOf(label)).sort((a, b) => a - b),
    )
    expect(within(screen.getByRole('list', { name: 'Bus timings' })).getAllByRole('listitem'))
      .toHaveLength(3)
    expect(screen.getByText('No live timing')).toBeTruthy()
    expect(screen.queryByText('26m')).toBeNull()
    expect(container.querySelector('.stop-favorite')?.tagName).toBe('BUTTON')
  })

  it('routes Back, opposite stop, route and destination actions through their callbacks', async () => {
    const user = userEvent.setup()
    const onBackToStops = vi.fn()
    const onSelectOppositeStop = vi.fn()
    const onSelectRoute = vi.fn()
    const onNavigateToStop = vi.fn()
    render(
      <StopsContent
        selectedStop={selectedStop}
        onBackToStops={onBackToStops}
        onSelectOppositeStop={onSelectOppositeStop}
        onSelectRoute={onSelectRoute}
        onNavigateToStop={onNavigateToStop}
        onSelectStopList={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleExpanded={vi.fn()}
        onDismissLocationNotice={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Back to stops' }))
    await user.click(screen.getByRole('button', { name: 'View D2 route details' }))
    await user.click(screen.getByRole('button', { name: 'Navigate to this stop' }))
    await user.click(screen.getByRole('button', { name: /Opposite bus stop: University Hall \(Opposite\), SR8/ }))

    expect(onBackToStops).toHaveBeenCalledOnce()
    expect(onSelectRoute).toHaveBeenCalledWith('D2')
    expect(onNavigateToStop).toHaveBeenCalledWith('SR7')
    expect(onSelectOppositeStop).toHaveBeenCalledWith('SR8')
  })

  it('shows the favourites empty state with a Browse stops action that switches to Nearby', async () => {
    const user = userEvent.setup()
    const onSelectStopList = vi.fn()
    const { container } = render(
      <StopsContent
        selectedStop={null}
        onBackToStops={vi.fn()}
        onSelectOppositeStop={vi.fn()}
        onSelectRoute={vi.fn()}
        onNavigateToStop={vi.fn()}
        stopListEntries={[]}
        selectedStopList="favourites"
        onSelectStopList={onSelectStopList}
        onToggleFavorite={vi.fn()}
        onToggleExpanded={vi.fn()}
        onDismissLocationNotice={vi.fn()}
      />,
    )

    expect(screen.getByText('No favourites? Use the Star icon to favourite stops.')).toBeTruthy()
    expect(container.querySelector('.stops-empty-icon')).toBeTruthy()
    const browse = screen.getByRole('button', { name: 'Browse stops' })
    expect(browse.getAttribute('type')).toBe('button')

    await user.click(browse)

    expect(onSelectStopList).toHaveBeenCalledOnce()
    expect(onSelectStopList).toHaveBeenCalledWith('nearby')
  })

  it('keeps the plain nearby empty state without the favourites action', () => {
    render(
      <StopsContent
        selectedStop={null}
        onBackToStops={vi.fn()}
        onSelectOppositeStop={vi.fn()}
        onSelectRoute={vi.fn()}
        onNavigateToStop={vi.fn()}
        stopListEntries={[]}
        selectedStopList="nearby"
        onSelectStopList={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleExpanded={vi.fn()}
        onDismissLocationNotice={vi.fn()}
      />,
    )

    expect(screen.getByText('No stops available.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Browse stops' })).toBeNull()
  })
})
