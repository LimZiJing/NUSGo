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

  it('announces minute timings as minutes regardless of their visual symbol', () => {
    const { container } = render(
      <StopDepartureList
        departures={[{
          routeId: 'A2',
          routeName: 'A2',
          routeColor: '#123456',
          timings: ['Arr', '1′', '12′'],
        }]}
        scheduledDepartures={[{
          routeId: 'A1',
          routeName: 'A1',
          routeColor: '#654321',
          message: 'First bus in 12′',
        }]}
        publicServices={[]}
        onSelectRoute={vi.fn()}
      />,
    )

    expect([...container.querySelectorAll('.stop-departure-time .visually-hidden')].map((element) => (
      element.textContent
    ))).toEqual(['Arriving now', '1 minute', '12 minutes'])
    expect(container.querySelector('.stop-departure-status .visually-hidden')?.textContent)
      .toBe('First bus in 12 minutes')
    expect([...container.querySelectorAll('.stop-departure-time [aria-hidden="true"]')].map((element) => (
      element.textContent
    ))).toEqual(['Arr', '1′', '12′'])
  })

  it('stacks only min-formatted arrival timings and preserves their spoken labels', () => {
    const { container } = render(
      <StopDepartureList
        departures={[{
          routeId: 'A2',
          routeName: 'A2',
          routeColor: '#123456',
          timings: ['1 min', '12 min', 'Arr'],
        }, {
          routeId: 'D1',
          routeName: 'D1',
          routeColor: '#654321',
          timings: ['Left', '1m', '-'],
        }]}
        publicServices={[{
          serviceNumber: '151',
          timings: ['2m', '3′', '-'],
          status: 'live',
        }]}
        onSelectRoute={vi.fn()}
      />,
    )

    const minuteLabels = [...container.querySelectorAll('.stop-departure-time-min')]
    expect(minuteLabels.map((label) => [...label.children].map((part) => part.textContent)))
      .toEqual([['1', 'min'], ['12', 'min']])
    expect(minuteLabels.map((label) => label.parentElement?.getAttribute('aria-hidden')))
      .toEqual(['true', 'true'])
    expect([...container.querySelectorAll('.stop-departure-time .visually-hidden')]
      .slice(0, 2)
      .map((label) => label.textContent))
      .toEqual(['1 minute', '12 minutes'])

    const otherTimings = [...container.querySelectorAll('.stop-departure-time')].slice(2)
    expect(otherTimings.every((timing) => !timing.querySelector('.stop-departure-time-min'))).toBe(true)
    expect(otherTimings[0].getAttribute('data-timing-state')).toBe('Arr')
    expect(otherTimings[1].getAttribute('data-timing-state')).toBe('Left')
    expect(otherTimings[2].querySelector('[aria-hidden="true"]')?.textContent).toBe('1m')
    expect(otherTimings[3].textContent).toBe('-')
    expect(otherTimings[4].querySelector('[aria-hidden="true"]')?.textContent).toBe('2m')
    expect(otherTimings[5].querySelector('[aria-hidden="true"]')?.textContent).toBe('3′')
    expect(otherTimings[6].textContent).toBe('-')
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

  it('shows when an out-of-operation public service next starts', () => {
    render(
      <StopDepartureList
        departures={[]}
        publicServices={[{
          serviceNumber: '151',
          timings: null,
          status: 'not-in-operation',
          startMessage: 'Starts 5:30 AM',
        }]}
        onSelectRoute={vi.fn()}
      />,
    )

    expect(screen.getByText('Starts 5:30 AM')).toBeTruthy()
    expect(screen.queryByText('Not in operation')).toBeNull()
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
