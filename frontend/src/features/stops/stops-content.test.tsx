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
    { routeId: 'A1', routeName: 'A1', routeColor: '#0b7258', load: 'unknown', timings: ['Arr', '8m', '17m'] },
    { routeId: 'D2', routeName: 'D2', routeColor: '#6e1d72', load: 'unknown', timings: ['4m', '12m', '-'] },
  ],
  scheduledDepartures: [],
  live: true,
  pollState: 'idle',
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

  // jsdom does not lay anything out and does not apply the imported stylesheet, so the scroll
  // owner is described explicitly: a column that overflows above the content element, and a
  // static wrapper that must be ignored.
  function renderInsideScrolledColumn(isMobileViewport: boolean) {
    const column = document.createElement('div')
    const wrapper = document.createElement('div')
    column.append(wrapper)
    document.body.append(column)
    Object.defineProperty(column, 'scrollHeight', { configurable: true, value: 2000 })
    Object.defineProperty(column, 'clientHeight', { configurable: true, value: 500 })
    column.scrollTop = 900
    wrapper.scrollTop = 640
    const realGetComputedStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element) => new Proxy(
      realGetComputedStyle(element),
      { get: (target, key) => (key === 'overflowY' && element === column ? 'auto' : Reflect.get(target, key, target)) },
    ))
    const props = {
      onBackToStops: vi.fn(),
      onSelectOppositeStop: vi.fn(),
      onSelectRoute: vi.fn(),
      onNavigateToStop: vi.fn(),
      onSelectStopList: vi.fn(),
      onToggleFavorite: vi.fn(),
      onToggleExpanded: vi.fn(),
      onDismissLocationNotice: vi.fn(),
    }
    const view = render(<StopsContent {...props} selectedStop={null} stopListEntries={[]} isMobileViewport={isMobileViewport} />, { container: wrapper })
    return { column, wrapper, props, view }
  }

  it('resets the desktop column when stop details open, so their heading starts at the top', () => {
    const { column, wrapper, props, view } = renderInsideScrolledColumn(false)
    expect(column.scrollTop).toBe(900)

    view.rerender(<StopsContent {...props} selectedStop={selectedStop} isMobileViewport={false} />)

    expect(column.scrollTop).toBe(0)
    expect(wrapper.scrollTop).toBe(640)
    expect(screen.getByRole('button', { name: 'Back to stops' })).toBeTruthy()
    vi.restoreAllMocks()
    column.remove()
  })

  it('leaves the mobile sheet scroll position to the sheet itself', () => {
    const { column, wrapper, props, view } = renderInsideScrolledColumn(true)

    view.rerender(<StopsContent {...props} selectedStop={selectedStop} isMobileViewport />)

    expect(column.scrollTop).toBe(900)
    expect(wrapper.scrollTop).toBe(640)
    vi.restoreAllMocks()
    column.remove()
  })
})
