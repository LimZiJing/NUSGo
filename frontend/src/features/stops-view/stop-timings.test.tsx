// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StopTimings } from './stop-timings'

afterEach(cleanup)

describe('StopTimings', () => {
  it('marks the empty timing state for muted card styling', () => {
    render(
      <StopTimings
        departures={[]}
        publicServices={[]}
        onSelectRoute={vi.fn()}
      />,
    )

    expect(screen.getByText('No bus timings available.').className).toBe('stop-timings-empty')
  })

  it('shows reachable favourite stop nicknames beside an internal route', () => {
    render(
      <StopTimings
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

    const destinations = screen.getByRole('list', { name: 'Reachable favourite shuttle stops' })
    expect(within(destinations).getByRole('listitem', { name: 'Library, shuttle stop, STOP-LIBRARY' })).toBeTruthy()
    expect(within(destinations).getByRole('listitem', { name: 'Hall, shuttle stop, STOP-HALL' })).toBeTruthy()
    expect(screen.getByText('→')).toBeTruthy()
    expect(screen.getByText('Library')).toBeTruthy()
    expect(screen.getByText('Hall')).toBeTruthy()
    expect(screen.getByText('9m')).toBeTruthy()
    expect(screen.getByText('11m')).toBeTruthy()
    expect(screen.getByText('13m')).toBeTruthy()

    const destinationBadges = document.querySelectorAll('.stop-reachable-favorite')
    expect(destinationBadges).toHaveLength(2)
    expect(destinationBadges[0]?.getAttribute('data-opposite')).toBeNull()
    expect(destinationBadges[1]?.getAttribute('data-opposite')).toBe('true')
    expect(destinationBadges[0]?.querySelector('.location-identity-icon--stop[aria-hidden="true"]')).toBeTruthy()
  })

  it('uses the same status row for scheduled routes and public services', () => {
    render(
      <StopTimings
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
      <StopTimings
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
})
