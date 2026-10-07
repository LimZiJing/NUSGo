// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RouteBrowser } from './route-browser'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'

afterEach(cleanup)

function createEightRouteNetwork() {
  const network = createValidTransitNetwork()
  const routeIds = ['A1', 'A2', 'D1', 'D2', 'K', 'P', 'R1', 'R2']
  const colors = ['#fb0101', '#e3cf0e', '#c77de0', '#6e1d72', '#33599c', '#bebebe', '#ee8136', '#008000']
  network.routes = routeIds.map((id, index) => ({
    ...network.routes[0],
    id,
    name: id,
    color: colors[index],
  }))
  return network
}

function createD2Network() {
  const network = createValidTransitNetwork()
  const stopIds = [
    'COM3', 'TCOMS-OPP', 'PGP', 'KR-MRT', 'LT27', 'UHALL', 'UHC-OPP', 'MUSEUM',
    'UTOWN', 'UHC', 'UHALL-OPP', 'S17', 'KR-MRT-OPP', 'PGPR', 'TCOMS', 'COM3',
  ]
  const stopNames: Record<string, string> = {
    COM3: 'COM 3',
    'TCOMS-OPP': 'Opp TCOMS',
    PGP: "Prince George's Park",
    'KR-MRT': 'Kent Ridge MRT',
    LT27: 'LT 27',
    UHALL: 'University Hall',
    'UHC-OPP': 'Opp University Health Centre',
    MUSEUM: 'Museum',
    UTOWN: 'University Town',
    UHC: 'University Health Centre',
    'UHALL-OPP': 'Opp University Hall',
    S17: 'S 17',
    'KR-MRT-OPP': 'Opp Kent Ridge MRT',
    PGPR: "Prince George's Park Foyer",
    TCOMS: 'TCOMS',
  }
  network.routes = [{
    id: 'D2',
    name: 'D2',
    color: '#6e1d72',
    stopIds,
  }]
  network.stops = Array.from(new Set(stopIds), (id) => ({
    id,
    longName: stopNames[id],
    shortName: id,
    latitude: 1,
    longitude: 103,
    services: ['D2'],
    opposite: null,
  }))
  return network
}

function setRouteListMetrics(routeList: HTMLElement, clientWidth: number, scrollWidth: number, scrollLeft = 0) {
  Object.defineProperties(routeList, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
    scrollLeft: { configurable: true, value: scrollLeft, writable: true },
  })
}

describe('RouteBrowser', () => {
  it('shows route cards in network order with their canonical ids and colors', () => {
    const network = createEightRouteNetwork()
    render(
      <RouteBrowser
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId={null}
        onRouteSelect={() => undefined}
      />,
    )

    const cards = screen.getAllByRole('button', { name: /^Route / })
    expect(cards.map((card) => card.getAttribute('data-route-id'))).toEqual([
      'A1', 'A2', 'D1', 'D2', 'R1', 'R2', 'K', 'P',
    ])
    expect(cards[0].textContent).toContain('A1')
    expect((cards[0] as HTMLButtonElement).style.getPropertyValue('--route-color')).toBe('#fb0101')
    expect(cards[0].getAttribute('aria-pressed')).toBe('false')
    expect((cards[1] as HTMLButtonElement).style.getPropertyValue('--route-text-color'))
      .toBe('#0f172a')
  })

  it('selects a route chip without opening a separate detail screen', async () => {
    const user = userEvent.setup()
    const network = createEightRouteNetwork()
    const onRouteSelect = vi.fn()
    render(
      <RouteBrowser
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId={null}
        onRouteSelect={onRouteSelect}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Route D2' }))

    expect(onRouteSelect).toHaveBeenCalledWith('D2')
    expect(screen.queryByRole('button', { name: 'Show all routes' })).toBeNull()
  })

  it('focuses a stop from a timeline row', async () => {
    const user = userEvent.setup()
    const network = createEightRouteNetwork()
    const onFocusStop = vi.fn()
    render(
      <RouteBrowser
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId="A1"
        onRouteSelect={() => undefined}
        onFocusStop={onFocusStop}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Stop A, stop STOP-A/ }))

    expect(onFocusStop).toHaveBeenCalledWith('STOP-A')
  })

  it('renders every D2 stop in canonical order, including the terminal return', () => {
    const network = createD2Network()
    render(
      <RouteBrowser
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId="D2"
        onRouteSelect={() => undefined}
      />,
    )

    const stopLabels = Array.from(
      screen.getByRole('list', { name: 'Route D2 ordered stops' }).children,
      (stop) => stop.querySelector('.explore-route-browser-stop-text')?.textContent,
    )
    expect(stopLabels).toEqual([
      'COM3COM3', 'TCOMS-OPPTCOMS-OPP', 'PGPPGP', 'KR-MRTKR-MRT',
      'LT27LT27', 'UHALLUHALL', 'UHC-OPPUHC-OPP', 'MUSEUMMUSEUM',
      'UTOWNUTOWN', 'UHCUHC', 'UHALL-OPPUHALL-OPP', 'S17S17',
      'KR-MRT-OPPKR-MRT-OPP', 'PGPRPGPR', 'TCOMSTCOMS', 'COM3COM3',
    ])
    expect(screen.getByText('16 stops')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /COM 3, stop COM3/ })).toHaveLength(2)
  })

  it('keeps the selected route visible as a pressed chip', () => {
    const network = createEightRouteNetwork()
    render(
      <RouteBrowser
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId="D2"
        onRouteSelect={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Route D2' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Show all routes' })).toBeNull()
  })

  it('does not scroll an already-visible first route when the tab opens', () => {
    const network = createEightRouteNetwork()
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    render(
      <RouteBrowser
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId="A1"
        onRouteSelect={() => undefined}
      />,
    )

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    })

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('shows directional controls and edge fades only when the row overflows', () => {
    const network = createEightRouteNetwork()
    render(
      <RouteBrowser
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId={null}
        onRouteSelect={() => undefined}
      />,
    )

    const routeList = screen.getByRole('group', { name: 'Shuttle routes' })
    const routeScroller = routeList.parentElement as HTMLElement
    setRouteListMetrics(routeList, 600, 600)
    fireEvent.scroll(routeList)
    expect(screen.queryByRole('button', { name: 'Scroll shuttle routes left' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Scroll shuttle routes right' })).toBeNull()

    setRouteListMetrics(routeList, 200, 600)
    fireEvent.scroll(routeList)
    expect(screen.queryByRole('button', { name: 'Scroll shuttle routes left' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Scroll shuttle routes right' })).toBeTruthy()
    expect(routeScroller.getAttribute('data-can-scroll-right')).toBe('true')

    setRouteListMetrics(routeList, 200, 600, 200)
    fireEvent.scroll(routeList)
    expect(screen.getByRole('button', { name: 'Scroll shuttle routes left' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Scroll shuttle routes right' })).toBeTruthy()
    expect(routeScroller.getAttribute('data-can-scroll-left')).toBe('true')
    expect(routeScroller.getAttribute('data-can-scroll-right')).toBe('true')

    setRouteListMetrics(routeList, 200, 600, 400)
    fireEvent.scroll(routeList)
    expect(screen.getByRole('button', { name: 'Scroll shuttle routes left' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Scroll shuttle routes right' })).toBeNull()
    expect(routeScroller.getAttribute('data-can-scroll-left')).toBe('true')
    expect(routeScroller.getAttribute('data-can-scroll-right')).toBeNull()
  })

  it('smoothly maps vertical wheel movement while leaving horizontal trackpad scrolling native', () => {
    const network = createEightRouteNetwork()
    render(
      <RouteBrowser
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId={null}
        onRouteSelect={() => undefined}
      />,
    )

    const routeList = screen.getByRole('group', { name: 'Shuttle routes' })
    setRouteListMetrics(routeList, 200, 600)
    const scrollBy = vi.fn()
    Object.defineProperty(routeList, 'scrollBy', { configurable: true, value: scrollBy })

    fireEvent.wheel(routeList, { deltaY: 80 })
    expect(scrollBy).toHaveBeenCalledWith({ left: 80, behavior: 'smooth' })

    fireEvent.wheel(routeList, { deltaX: 40 })
    expect(scrollBy).toHaveBeenCalledTimes(1)

    setRouteListMetrics(routeList, 200, 600, 400)
    fireEvent.wheel(routeList, { deltaY: 80 })
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 80, behavior: 'smooth' })
  })

  it('supports mouse dragging without replacing native touch dragging', () => {
    const network = createEightRouteNetwork()
    render(
      <RouteBrowser
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId={null}
        onRouteSelect={() => undefined}
      />,
    )

    const routeList = screen.getByRole('group', { name: 'Shuttle routes' })
    setRouteListMetrics(routeList, 200, 600)
    fireEvent.pointerDown(routeList, { button: 0, clientX: 200, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerMove(routeList, { clientX: 120, pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(routeList, { clientX: 120, pointerId: 1, pointerType: 'mouse' })
    expect(routeList.scrollLeft).toBe(80)

    setRouteListMetrics(routeList, 200, 600)
    fireEvent.pointerDown(routeList, { clientX: 200, pointerId: 2, pointerType: 'touch' })
    fireEvent.pointerMove(routeList, { clientX: 120, pointerId: 2, pointerType: 'touch' })
    fireEvent.pointerUp(routeList, { clientX: 120, pointerId: 2, pointerType: 'touch' })
    expect(routeList.scrollLeft).toBe(0)
  })

  it('can drag from the visible left indicator all the way to the start', () => {
    const network = createEightRouteNetwork()
    render(
      <RouteBrowser
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId={null}
        onRouteSelect={() => undefined}
      />,
    )

    const routeList = screen.getByRole('group', { name: 'Shuttle routes' })
    setRouteListMetrics(routeList, 200, 600, 200)
    fireEvent.scroll(routeList)

    const leftArrow = screen.getByRole('button', { name: 'Scroll shuttle routes left' })
    fireEvent.pointerDown(leftArrow, {
      button: 0,
      clientX: 40,
      pointerId: 3,
      pointerType: 'mouse',
    })
    fireEvent.pointerMove(routeList, { clientX: 240, pointerId: 3, pointerType: 'mouse' })
    fireEvent.pointerUp(routeList, { clientX: 240, pointerId: 3, pointerType: 'mouse' })

    expect(routeList.scrollLeft).toBe(0)
  })

  it('keeps edge arrows clickable without capturing a stationary click', async () => {
    const user = userEvent.setup()
    const network = createEightRouteNetwork()
    render(
      <RouteBrowser
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId={null}
        onRouteSelect={() => undefined}
      />,
    )

    const routeList = screen.getByRole('group', { name: 'Shuttle routes' })
    setRouteListMetrics(routeList, 200, 600, 200)
    fireEvent.scroll(routeList)
    const scrollBy = vi.fn()
    const setPointerCapture = vi.fn()
    Object.defineProperty(routeList, 'scrollBy', { configurable: true, value: scrollBy })
    Object.defineProperty(routeList, 'setPointerCapture', { configurable: true, value: setPointerCapture })

    await user.click(screen.getByRole('button', { name: 'Scroll shuttle routes left' }))

    expect(scrollBy).toHaveBeenCalledWith({ left: -150, behavior: 'smooth' })
    expect(setPointerCapture).not.toHaveBeenCalled()
  })
})
