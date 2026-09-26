// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShuttleRouteControl } from './shuttle-route-control'
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

describe('ShuttleRouteControl', () => {
  it('lists all routes and shows the selected route details', () => {
    const markup = renderToStaticMarkup(
      <ShuttleRouteControl
        network={createEightRouteNetwork()}
        networkIndex={createTransitIndex(createEightRouteNetwork())}
        selectedRouteId="A1"
        onRouteSelect={() => undefined}
      />,
    )

    expect(markup.match(/<option/g)).toHaveLength(9)
    expect(markup).toContain('value="A1"')
    expect(markup).toContain('Route A1 selected.')
    expect(markup).toContain('Direction:')
    expect(markup).toContain('Stop A (STOP-A)')
    expect(markup).toContain('2 of 2 shuttle stops shown')
    expect(markup).toContain('Ordered stops')
    expect(markup).toContain('Show all routes')
  })

  it('announces that all routes are shown when selection is cleared', () => {
    const markup = renderToStaticMarkup(
      <ShuttleRouteControl
        network={createEightRouteNetwork()}
        networkIndex={createTransitIndex(createEightRouteNetwork())}
        selectedRouteId={null}
        onRouteSelect={() => undefined}
      />,
    )

    expect(markup).toContain('Showing all 8 shuttle routes and all 2 shuttle stops.')
    expect(markup).not.toContain('route-details')
  })

  it('treats an unknown selection as the all-routes state', () => {
    const markup = renderToStaticMarkup(
      <ShuttleRouteControl
        network={createEightRouteNetwork()}
        networkIndex={createTransitIndex(createEightRouteNetwork())}
        selectedRouteId="UNKNOWN"
        onRouteSelect={() => undefined}
      />,
    )

    expect(markup).toContain('Showing all 8 shuttle routes and all 2 shuttle stops.')
    expect(markup).not.toContain('route-details')
  })

  it('shows route cards in network order with their canonical ids and colors on mobile', () => {
    const network = createEightRouteNetwork()
    render(
      <ShuttleRouteControl
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId={null}
        mobileViewport
        onRouteSelect={() => undefined}
      />,
    )

    const cards = screen.getAllByRole('button', { name: /^Route / })
    expect(cards.map((card) => card.getAttribute('data-route-id'))).toEqual([
      'A1', 'A2', 'D1', 'D2', 'K', 'P', 'R1', 'R2',
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
      <ShuttleRouteControl
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId={null}
        mobileViewport
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
      <ShuttleRouteControl
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId="A1"
        mobileViewport
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
      <ShuttleRouteControl
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId="D2"
        mobileViewport
        onRouteSelect={() => undefined}
      />,
    )

    const stopLabels = Array.from(
      screen.getByRole('list', { name: 'Route D2 ordered stops' }).children,
      (stop) => stop.querySelector('.route-timeline-text')?.textContent,
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
      <ShuttleRouteControl
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId="D2"
        mobileViewport
        onRouteSelect={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Route D2' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Show all routes' })).toBeNull()
  })
})
