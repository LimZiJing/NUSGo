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
          load: 'unknown',
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
    ))).toEqual(['Arriving now. Crowding estimate unavailable.', '1 minute', '12 minutes'])
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
          load: 'unknown',
          timings: ['1 min', '12 min', 'Arr'],
        }, {
          routeId: 'D1',
          routeName: 'D1',
          routeColor: '#654321',
          load: 'unknown',
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
      .toEqual(['Arrives in 1 minute. Crowding estimate unavailable.', '12 minutes'])

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

  it.each([
    'low',
    'medium',
    'high',
  ] as const)('colours only the next arrival for %s crowding without extra visible labels', (load) => {
    const { container } = render(
      <StopDepartureList
        departures={[{
          routeId: 'A2',
          routeName: 'A2',
          routeColor: '#123456',
          load,
          timings: ['3m', '6m', '9m'],
        }]}
        publicServices={[]}
        onSelectRoute={vi.fn()}
      />,
    )

    const times = [...container.querySelectorAll('.stop-departure-time')]
    const nextArrival = times[0]

    expect(nextArrival.getAttribute('data-load-level')).toBe(load)
    expect(nextArrival.querySelector('.visually-hidden')?.textContent)
      .toBe(`Arrives in 3 minutes. Estimated crowding: ${load}.`)
    expect(nextArrival.querySelector('[aria-hidden="true"]')?.textContent).toBe('3m')
    expect(nextArrival.querySelector('.stop-departure-load-cue')).toBeNull()
    expect(times.slice(1).every((time) => time.getAttribute('data-load-level') === null)).toBe(true)
    expect(screen.queryByText('Estimated crowding for the next bus on each route.')).toBeNull()
  })

  it('keeps unknown load neutral and explains that the estimate is unavailable', () => {
    const { container } = render(
      <StopDepartureList
        departures={[{
          routeId: 'A2',
          routeName: 'A2',
          routeColor: '#123456',
          load: 'unknown',
          timings: ['3m', '6m', '9m'],
        }]}
        publicServices={[]}
        onSelectRoute={vi.fn()}
      />,
    )

    const nextArrival = container.querySelector('.stop-departure-time')

    expect(nextArrival?.getAttribute('data-load-level')).toBe('unknown')
    expect(nextArrival?.querySelector('.stop-departure-load-cue')).toBeNull()
    expect(nextArrival?.querySelector('.visually-hidden')?.textContent)
      .toBe('Arrives in 3 minutes. Crowding estimate unavailable.')
    expect(screen.queryByText('Estimated crowding for the next bus on each route.')).toBeNull()
  })

  it('keeps load cues out of keyboard navigation', async () => {
    const user = userEvent.setup()
    render(
      <StopDepartureList
        departures={[{
          routeId: 'A2',
          routeName: 'A2',
          routeColor: '#123456',
          load: 'medium',
          timings: ['3m', '6m', '9m'],
        }]}
        publicServices={[]}
        onSelectRoute={vi.fn()}
      />,
    )

    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View A2 route details' }))
    await user.tab()
    expect(document.activeElement).toBe(document.body)
  })

  it('shows the first reachable favourite beside an internal route and the rest in a popover', async () => {
    const user = userEvent.setup()
    render(
      <StopDepartureList
        departures={[{
          routeId: 'A2',
          routeName: 'A2',
          routeColor: '#123456',
          load: 'unknown',
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
            load: 'unknown',
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
          load: 'unknown',
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

  it('shows a public service start time when live arrivals are unavailable', () => {
    render(
      <StopDepartureList
        departures={[]}
        noLiveData
        publicServices={[{
          serviceNumber: '151',
          timings: null,
          status: 'not-in-operation',
          startMessage: 'Starts 7:00 AM',
        }]}
        onSelectRoute={vi.fn()}
      />,
    )

    expect(screen.getByText('Starts 7:00 AM')).toBeTruthy()
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
