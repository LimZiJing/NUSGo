import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TransitRouteControl } from './TransitRouteControl'
import { createValidTransitNetwork } from '../transit/test-fixtures'

function createEightRouteNetwork() {
  const network = createValidTransitNetwork()
  const routeIds = ['A1', 'A2', 'D1', 'D2', 'R1', 'R2', 'K', 'P']
  network.routes = routeIds.map((id) => ({
    ...network.routes[0],
    id,
    name: id,
  }))
  return network
}

describe('TransitRouteControl', () => {
  it('lists all routes and shows the selected route details', () => {
    const markup = renderToStaticMarkup(
      <TransitRouteControl
        network={createEightRouteNetwork()}
        selectedRouteId="A1"
        onRouteSelect={() => undefined}
      />,
    )

    expect(markup.match(/<option/g)).toHaveLength(9)
    expect(markup).toContain('value="A1"')
    expect(markup).toContain('Route A1 selected.')
    expect(markup).toContain('Direction:')
    expect(markup).toContain('Stop A (STOP-A)')
    expect(markup).toContain('Ordered stops')
    expect(markup).toContain('Show all routes')
  })

  it('announces that all routes are shown when selection is cleared', () => {
    const markup = renderToStaticMarkup(
      <TransitRouteControl
        network={createEightRouteNetwork()}
        selectedRouteId={null}
        onRouteSelect={() => undefined}
      />,
    )

    expect(markup).toContain('Showing all 8 shuttle routes.')
    expect(markup).not.toContain('route-details')
  })
})
