// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BusStopTimings } from './bus-stop-timings'

afterEach(cleanup)

describe('BusStopTimings', () => {
  it('shows reachable favourite stop nicknames beside an internal route', () => {
    render(
      <BusStopTimings
        departures={[{
          routeId: 'A2',
          routeName: 'A2',
          routeColor: '#123456',
          timings: ['9m', '11m', '13m'],
          reachableFavoriteStops: [
            { id: 'STOP-LIBRARY', name: 'Library', isOpposite: false },
            { id: 'STOP-HALL', name: 'Hall', isOpposite: true },
          ],
        }]}
        publicServices={[]}
        onSelectRoute={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Reachable favourite stops: Library, Hall')).toBeTruthy()
    expect(screen.getByText('→')).toBeTruthy()
    expect(screen.getByText('Library')).toBeTruthy()
    expect(screen.getByText('Hall')).toBeTruthy()
    expect(screen.getByText('9m')).toBeTruthy()
    expect(screen.getByText('11m')).toBeTruthy()
    expect(screen.getByText('13m')).toBeTruthy()

    const destinations = document.querySelectorAll('.mobile-stop-reachable-favorite')
    expect(destinations).toHaveLength(2)
    expect(destinations[0]?.getAttribute('data-opposite')).toBeNull()
    expect(destinations[1]?.getAttribute('data-opposite')).toBe('true')
  })

  it('uses the same status row for scheduled routes and public services', () => {
    render(
      <BusStopTimings
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
    expect(document.querySelectorAll('.mobile-stop-departure-status')).toHaveLength(2)
  })
})
