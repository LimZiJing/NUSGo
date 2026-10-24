// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StopDepartureList } from './stop-departure-list'

afterEach(cleanup)

describe('StopDepartureList', () => {
  it('marks the empty timing state for muted card styling', () => {
    render(
      <StopDepartureList
        departures={[]}
        publicServices={[]}
        onSelectRoute={vi.fn()}
      />,
    )

    expect(screen.getByText('No bus timings available.').className).toBe('stop-departure-list-empty')
  })

  it('shows the first reachable favourite beside an internal route and the rest in a popover', async () => {
    const user = userEvent.setup()
    render(
      <StopDepartureList
        departures={[{
          routeId: 'A2',
          routeName: 'A2',
          routeColor: '#123456',
          timings: ['9m', '11m', '13m'],
          reachableFavouriteStops: [
            { id: 'STOP-LIBRARY', name: 'Library', isOpposite: false },
            { id: 'STOP-HALL', name: 'Hall', isOpposite: true },
          ],
        }]}
        publicServices={[]}
        onSelectRoute={vi.fn()}
      />,
    )

    const destinations = screen.getByRole('list', { name: 'Reachable favourite bus stops' })
    expect(within(destinations).getByRole('listitem', { name: 'Library, bus stop, STOP-LIBRARY' })).toBeTruthy()
    expect(screen.getByText('→')).toBeTruthy()
    expect(screen.getByText('9m')).toBeTruthy()
    expect(screen.getByText('11m')).toBeTruthy()
    expect(screen.getByText('13m')).toBeTruthy()
    expect(document.querySelectorAll('.stop-reachable-favourite')).toHaveLength(1)
    expect(document.querySelector('.stop-reachable-favourite')?.getAttribute('data-opposite')).toBeNull()
    expect(screen.queryByText('Hall')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Show 1 more reachable favourite bus stop' }))

    const hall = await screen.findByRole('listitem', { name: 'Hall, bus stop, STOP-HALL' })
    expect(hall.getAttribute('data-opposite')).toBe('true')
    expect(within(destinations).queryByRole('listitem', { name: 'Hall, bus stop, STOP-HALL' })).toBeNull()
  })

  it('renders the popover inside the list scroll container so it scrolls and clips with the cards', async () => {
    const user = userEvent.setup()
    render(
      <div className="navigation-panel-scroll-content" data-testid="scroller">
        <StopDepartureList
          departures={[{
            routeId: 'A2',
            routeName: 'A2',
            routeColor: '#123456',
            timings: ['9m', '11m', '13m'],
            reachableFavouriteStops: [
              { id: 'STOP-LIBRARY', name: 'Library', isOpposite: false },
              { id: 'STOP-HALL', name: 'Hall', isOpposite: true },
            ],
          }]}
          publicServices={[]}
          onSelectRoute={vi.fn()}
        />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Show 1 more reachable favourite bus stop' }))

    const hall = await screen.findByRole('listitem', { name: 'Hall, bus stop, STOP-HALL' })
    expect(screen.getByTestId('scroller').contains(hall)).toBe(true)
  })

  it('has no more button when there is a single reachable favourite', () => {
    render(
      <StopDepartureList
        departures={[{
          routeId: 'A2',
          routeName: 'A2',
          routeColor: '#123456',
          timings: ['9m', '11m', '13m'],
          reachableFavouriteStops: [{ id: 'STOP-LIBRARY', name: 'Library', isOpposite: false }],
        }]}
        publicServices={[]}
        onSelectRoute={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /more reachable favourite/ })).toBeNull()
  })

  it('uses the same status row for scheduled routes and public services', () => {
    render(
      <StopDepartureList
        departures={[]}
        scheduledDepartures={[{
          routeId: 'A2',
          routeName: 'A2',
          routeColor: '#123456',
          message: 'Starts 7:04 AM',
        }]}
        publicServices={[{ serviceNumber: '95', timings: null }]}
        onSelectRoute={vi.fn()}
      />,
    )

    expect(screen.getByText('Starts 7:04 AM')).toBeTruthy()
    expect(screen.getByText('No live timing')).toBeTruthy()
    expect(document.querySelectorAll('.stop-departure-status')).toHaveLength(2)
  })

  it('explains normalized public timing states', () => {
    render(
      <StopDepartureList
        departures={[]}
        publicServices={[
          { serviceNumber: '95', timings: null, status: 'no-estimate' },
          { serviceNumber: '151', timings: null, status: 'not-in-operation' },
          { serviceNumber: '96', timings: null, status: 'provider-error' },
        ]}
        onSelectRoute={vi.fn()}
      />,
    )

    expect(screen.getByText('No estimate available')).toBeTruthy()
    expect(screen.getByText('Not in operation')).toBeTruthy()
    expect(screen.getByText('Live timing unavailable')).toBeTruthy()
  })

  it('keeps public arrival timings visible when live data is available', () => {
    render(
      <StopDepartureList
        departures={[]}
        publicServices={[{ serviceNumber: '151', timings: ['2m', '5m', '-'], status: 'live' }]}
        onSelectRoute={vi.fn()}
      />,
    )

    expect(screen.getByText('151')).toBeTruthy()
    expect(screen.getByText('2m')).toBeTruthy()
    expect(screen.getByText('5m')).toBeTruthy()
  })
})
