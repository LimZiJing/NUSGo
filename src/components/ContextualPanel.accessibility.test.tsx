// @vitest-environment jsdom

import { useState, type ReactNode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ContextualPanel } from './ContextualPanel'
import {
  contextualPanelReducer,
  createInitialContextualPanelState,
  type ContextualPanelAction,
  type ContextualPanelState,
} from '../domain/contextual-panel/state'
import { createTransitIndex } from '../domain/transit'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import type { TransitNetwork } from '../domain/transit/types'
import type { TransitNetworkIndex } from '../domain/transit'
import type { VenueLocationMap } from '../domain/venue/types'

const venues: VenueLocationMap = {
  'COM1-0210': {
    roomName: 'Computing 1, Level 2',
    floor: 2,
    location: { x: 103.77, y: 1.3 },
  },
}

function PanelHarness({
  initialState = createInitialContextualPanelState(),
  network: networkOverride,
  networkIndex: networkIndexOverride,
}: {
  initialState?: ContextualPanelState
  network?: TransitNetwork | null
  networkIndex?: TransitNetworkIndex | null
}) {
  const [state, setState] = useState(initialState)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const network = networkOverride === undefined ? createValidTransitNetwork() : networkOverride
  const networkIndex = networkIndexOverride === undefined
    ? network ? createTransitIndex(network) : null
    : networkIndexOverride
  const dispatch = (action: ContextualPanelAction): void => {
    setState((current) => contextualPanelReducer(current, action))
  }

  return (
    <ContextualPanel
      state={state}
      venues={venues}
      network={network}
      networkIndex={networkIndex}
      selectedRouteId={selectedRouteId}
      onQueryChange={(query) => dispatch({ type: 'set-query', query })}
      onVenueSelect={(result) => dispatch({ type: 'select-venue', result })}
      onOpenVenueSearch={() => dispatch({ type: 'open-venue-search' })}
      onOpenShuttle={() => dispatch({ type: 'open-shuttle' })}
      onBack={() => dispatch({ type: 'back' })}
      onClose={() => dispatch({ type: 'close' })}
      onEscape={() => dispatch({ type: 'escape' })}
      onRouteSelect={setSelectedRouteId}
    />
  )
}

function PanelWithOutsideControl({ children }: { children: ReactNode }) {
  return (
    <>
      <button type="button">Outside panel</button>
      {children}
    </>
  )
}

afterEach(cleanup)

describe('ContextualPanel accessibility workflows', () => {
  it('uses labelled native structure and focuses venue search on entry', async () => {
    render(<PanelHarness />)
    const search = screen.getByRole('searchbox', { name: 'Find a venue' })

    await waitFor(() => expect(document.activeElement).toBe(search))

    const panel = screen.getByRole('region', { name: 'Explore NUS' })
    expect(panel.getAttribute('aria-labelledby')).toBe('contextual-panel-heading')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Venue search opened.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Browse shuttle routes' })).toBeTruthy()
  })

  it('preserves query history, operates by keyboard, and focuses venue details', async () => {
    const user = userEvent.setup()
    render(<PanelHarness />)
    const search = screen.getByRole('searchbox', { name: 'Find a venue' })

    await user.type(search, 'COM1')
    await user.tab()
    await user.tab()
    const result = screen.getByRole('button', { name: /COM1-0210/ })
    expect(document.activeElement).toBe(result)

    await user.keyboard('{Enter}')
    const detailHeading = await screen.findByRole('heading', { name: 'COM1-0210' })
    await waitFor(() => expect(document.activeElement).toBe(detailHeading))
    expect(screen.getByText('Venue details opened for COM1-0210.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back to venue search' }))
    const restoredSearch = await screen.findByRole('searchbox', { name: 'Find a venue' })
    await waitFor(() => expect((restoredSearch as HTMLInputElement).value).toBe('COM1'))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /COM1-0210/ })))
  })

  it('focuses route selection and restores the shuttle opener for Back, Escape, and Close', async () => {
    const user = userEvent.setup()
    render(<PanelHarness />)
    const opener = screen.getByRole('button', { name: 'Browse shuttle routes' })

    await user.click(opener)
    const routeSelect = await screen.findByRole('combobox', { name: 'Shuttle route' })
    await waitFor(() => expect(document.activeElement).toBe(routeSelect))
    expect(screen.queryByText('Shuttle routes opened.')).toBeNull()
    expect(screen.getByText(/Showing all 1 shuttle routes/)).toBeTruthy()

    await user.selectOptions(routeSelect, 'A1')
    expect(screen.getByText(/Route A1 selected\./)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back to previous map context' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Browse shuttle routes' })))

    await user.click(screen.getByRole('button', { name: 'Browse shuttle routes' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Browse shuttle routes' })))

    await user.click(screen.getByRole('button', { name: 'Browse shuttle routes' }))
    await user.click(screen.getByRole('button', { name: 'Close map context' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Browse shuttle routes' })))
  })

  it('restores the neutral entry control and never leaves focus on removed search content', async () => {
    const user = userEvent.setup()
    render(<PanelHarness />)
    const search = screen.getByRole('searchbox', { name: 'Find a venue' })

    await user.keyboard('{Escape}')
    const heading = await screen.findByRole('heading', { name: 'Explore NUS' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(search.isConnected).toBe(false)

    const findVenue = screen.getByRole('button', { name: 'Find a venue' })
    await user.click(findVenue)
    await user.click(screen.getByRole('button', { name: 'Close map context' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Find a venue' })))
  })

  it('uses a deterministic Back fallback while routes load and focuses the select when they arrive', async () => {
    const state = { ...createInitialContextualPanelState(), mode: 'shuttle' as const }
    const validNetwork = createValidTransitNetwork()
    const validNetworkIndex = createTransitIndex(validNetwork)
    const { rerender } = render(
      <PanelHarness initialState={state} network={null} networkIndex={null} />,
    )
    const back = screen.getByRole('button', { name: 'Back to previous map context' })
    const routeSelect = screen.getByRole('combobox', { name: 'Shuttle route' })

    await waitFor(() => expect(document.activeElement).toBe(back))
    expect((routeSelect as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByText('Loading shuttle routes…')).toBeTruthy()

    rerender(
      <PanelHarness
        initialState={state}
        network={validNetwork}
        networkIndex={validNetworkIndex}
      />,
    )

    await waitFor(() => expect(document.activeElement).toBe(routeSelect))
  })

  it('does not steal focus when routes become available after the user leaves the fallback', async () => {
    const user = userEvent.setup()
    const state = { ...createInitialContextualPanelState(), mode: 'shuttle' as const }
    const validNetwork = createValidTransitNetwork()
    const validNetworkIndex = createTransitIndex(validNetwork)
    const { rerender } = render(
      <PanelWithOutsideControl>
        <PanelHarness initialState={state} network={null} networkIndex={null} />
      </PanelWithOutsideControl>,
    )
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Back to previous map context' }),
    ))

    const outside = screen.getByRole('button', { name: 'Outside panel' })
    await user.click(outside)
    const routeSelect = screen.getByRole('combobox', { name: 'Shuttle route' })
    rerender(
      <PanelWithOutsideControl>
        <PanelHarness
          initialState={state}
          network={validNetwork}
          networkIndex={validNetworkIndex}
        />
      </PanelWithOutsideControl>,
    )

    expect(document.activeElement).toBe(outside)
    expect(document.activeElement).not.toBe(routeSelect)
  })

  it('keeps focus on Back for an empty-route fallback', async () => {
    const network = createValidTransitNetwork()
    network.routes = []
    const state = { ...createInitialContextualPanelState(), mode: 'shuttle' as const }
    render(<PanelHarness initialState={state} network={network} networkIndex={null} />)

    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Back to previous map context' }),
    ))
    expect((screen.getByRole('combobox', { name: 'Shuttle route' }) as HTMLSelectElement).disabled)
      .toBe(true)
    expect(screen.getByText('Showing all 0 shuttle routes and all 2 shuttle stops.')).toBeTruthy()
  })

  it('keeps responsive presentation structure semantic without a modal role', () => {
    const { container } = render(<PanelHarness />)
    const panel = container.querySelector('.contextual-panel')

    expect(panel).not.toBeNull()
    expect(panel?.classList.contains('contextual-panel-venue-search')).toBe(true)
    expect(container.querySelector('[aria-modal="true"]')).toBeNull()
  })
})
