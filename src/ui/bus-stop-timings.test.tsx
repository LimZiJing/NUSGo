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
            { id: 'STOP-LIBRARY', name: 'Library' },
            { id: 'STOP-HALL', name: 'Hall' },
          ],
        }]}
        publicServices={[]}
        onSelectRoute={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Reachable favourite stops: Library, Hall')).toBeTruthy()
    expect(screen.getByText('Library')).toBeTruthy()
    expect(screen.getByText('Hall')).toBeTruthy()
    expect(screen.getByText('9m')).toBeTruthy()
    expect(screen.getByText('11m')).toBeTruthy()
    expect(screen.getByText('13m')).toBeTruthy()
  })
})
