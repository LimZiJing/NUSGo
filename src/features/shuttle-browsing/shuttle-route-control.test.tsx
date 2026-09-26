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
  const routeIds = ['A1', 'A2', 'D1', 'D2', 'R1', 'R2', 'K', 'P']
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
      'A1', 'A2', 'D1', 'D2', 'R1', 'R2', 'K', 'P',
    ])
    expect(cards[0].textContent).toContain('A1')
    expect((cards[0] as HTMLButtonElement).style.getPropertyValue('--route-color')).toBe('#fb0101')
    expect(cards[0].getAttribute('aria-pressed')).toBe('false')
  })

  it('opens route details after selecting a route card', async () => {
    const user = userEvent.setup()
    const network = createEightRouteNetwork()
    const onRouteSelect = vi.fn()
    const onOpenRouteDetail = vi.fn()
    render(
      <ShuttleRouteControl
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId={null}
        mobileViewport
        onRouteSelect={onRouteSelect}
        onOpenRouteDetail={onOpenRouteDetail}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Route D2' }))

    expect(onRouteSelect).toHaveBeenCalledWith('D2')
    expect(onOpenRouteDetail).toHaveBeenCalledOnce()
  })

  it('clears map selection from the route list with Show all routes', async () => {
    const user = userEvent.setup()
    const network = createEightRouteNetwork()
    const onRouteSelect = vi.fn()
    render(
      <ShuttleRouteControl
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId="D2"
        mobileViewport
        onRouteSelect={onRouteSelect}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Show all routes' }))

    expect(onRouteSelect).toHaveBeenCalledWith(null)
  })

  it('renders every D2 stop in canonical order, including the terminal return', () => {
    const network = createD2Network()
    render(
      <ShuttleRouteControl
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId="D2"
        mobileViewport
        mobileRouteDetail
        onRouteSelect={() => undefined}
      />,
    )

    const stopLabels = Array.from(
      screen.getByRole('list', { name: 'Ordered stops' }).children,
      (stop) => stop.textContent,
    )
    expect(stopLabels).toEqual([
      'COM 3 (COM3)',
      'Opp TCOMS (TCOMS-OPP)',
      "Prince George's Park (PGP)",
      'Kent Ridge MRT (KR-MRT)',
      'LT 27 (LT27)',
      'University Hall (UHALL)',
      'Opp University Health Centre (UHC-OPP)',
      'Museum (MUSEUM)',
      'University Town (UTOWN)',
      'University Health Centre (UHC)',
      'Opp University Hall (UHALL-OPP)',
      'S 17 (S17)',
      'Opp Kent Ridge MRT (KR-MRT-OPP)',
      "Prince George's Park Foyer (PGPR)",
      'TCOMS (TCOMS)',
      'COM 3 (COM3)',
    ])
  })

  it('clears a selected route through the explicit Show all routes action', async () => {
    const user = userEvent.setup()
    const network = createEightRouteNetwork()
    const onShowAllRoutes = vi.fn()
    render(
      <ShuttleRouteControl
        network={network}
        networkIndex={createTransitIndex(network)}
        selectedRouteId="D2"
        mobileViewport
        mobileRouteDetail
        onRouteSelect={() => undefined}
        onShowAllRoutes={onShowAllRoutes}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Show all routes' }))

    expect(onShowAllRoutes).toHaveBeenCalledOnce()
  })
})
