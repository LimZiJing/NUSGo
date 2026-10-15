// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
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

  it('shows reachable favourite stop nicknames beside an internal route', () => {
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
    expect(within(destinations).getByRole('listitem', { name: 'Hall, bus stop, STOP-HALL' })).toBeTruthy()
    expect(screen.getByText('→')).toBeTruthy()
    expect(screen.getByText('Library')).toBeTruthy()
    expect(screen.getByText('Hall')).toBeTruthy()
    expect(screen.getByText('9m')).toBeTruthy()
    expect(screen.getByText('11m')).toBeTruthy()
    expect(screen.getByText('13m')).toBeTruthy()

    const destinationBadges = document.querySelectorAll('.stop-reachable-favourite')
    expect(destinationBadges).toHaveLength(2)
    expect(destinationBadges[0]?.getAttribute('data-opposite')).toBeNull()
    expect(destinationBadges[1]?.getAttribute('data-opposite')).toBe('true')
    expect(destinationBadges[0]?.querySelector('.location-identity-icon--stop')).toBeNull()
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
})
