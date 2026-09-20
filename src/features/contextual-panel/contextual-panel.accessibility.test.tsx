// @vitest-environment jsdom

import { useState, type ReactNode, type RefObject } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ContextualPanel } from './contextual-panel'
import {
  contextualPanelReducer,
  createInitialContextualPanelState,
  type ContextualPanelAction,
  type ContextualPanelState,
} from './state'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import type { TransitNetwork } from '../../domain/transit/types'
import type { TransitNetworkIndex } from '../../domain/transit'
import type { VenueLocationMap } from '../../domain/venue/types'
import type { PanelStatus } from './status'

const venues: VenueLocationMap = {
  'COM1-0210': {
    roomName: 'Computing 1, Level 2',
    floor: 2,
    location: { x: 103.77, y: 1.3 },
  },
}

function renderShuttleRoutes(
  selectRef: RefObject<HTMLSelectElement | null>,
  network: TransitNetwork | null,
  networkIndex: TransitNetworkIndex | null,
  selectedRouteId: string | null,
  onRouteSelect: (routeId: string | null) => void,
): ReactNode {
  const routes = networkIndex?.routes ?? network?.routes ?? []
  const selectedRoute = selectedRouteId && networkIndex
    ? networkIndex.routeById.get(selectedRouteId)
    : undefined
  const stopCount = networkIndex?.stops.length ?? network?.stops.length ?? 0
  const message = !network
    ? 'Loading shuttle routes…'
    : selectedRoute
      ? `Route ${selectedRoute.name} selected.`
      : `Showing all ${routes.length} shuttle routes and all ${stopCount} shuttle stops.`

  return (
    <>
      <label htmlFor="route-select">Shuttle route</label>
      <select
        id="route-select"
        ref={selectRef}
        aria-label="Shuttle route"
        value={selectedRouteId ?? ''}
        disabled={routes.length === 0}
        onChange={(event) => onRouteSelect(event.target.value || null)}
      >
        <option value="">Show all routes</option>
        {routes.map((route) => (
          <option key={route.id} value={route.id}>{route.name}</option>
        ))}
      </select>
      <p>{message}</p>
    </>
  )
}

function PanelHarness({
  initialState = createInitialContextualPanelState(),
  network: networkOverride,
  networkIndex: networkIndexOverride,
  mobileViewport = true,
  minimized = false,
  status,
}: {
  initialState?: ContextualPanelState
  network?: TransitNetwork | null
  networkIndex?: TransitNetworkIndex | null
  mobileViewport?: boolean
  minimized?: boolean
  status?: PanelStatus | null
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
      shuttleRoutesAvailable={(networkIndex?.routes ?? network?.routes ?? []).length > 0}
      renderShuttleRoutes={(selectRef) => renderShuttleRoutes(
        selectRef,
        network,
        networkIndex,
        selectedRouteId,
        setSelectedRouteId,
      )}
      mobileViewport={mobileViewport}
      minimized={minimized}
      status={status}
      onQueryChange={(query) => dispatch({ type: 'set-query', query })}
      onVenueSelect={(result) => dispatch({ type: 'select-venue', result })}
      onOpenVenueSearch={() => dispatch({ type: 'open-venue-search' })}
      onOpenShuttle={() => dispatch({ type: 'open-shuttle' })}
      onBack={() => dispatch({ type: 'back' })}
      onClose={() => dispatch({ type: 'close' })}
      onEscape={() => dispatch({ type: 'escape' })}
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

function PanelWithOutsideControls({ children }: { children: ReactNode }) {
  return (
    <>
      <button type="button">Map control</button>
      <input aria-label="Contextual panel search outside" />
      <button type="button">Other visible control</button>
      {children}
    </>
  )
}

function MinimizedPanelHarness() {
  const [state, setState] = useState({
    ...createInitialContextualPanelState(),
    query: 'COM1',
  })
  const [minimized, setMinimized] = useState(true)
  const network = createValidTransitNetwork()
  const networkIndex = createTransitIndex(network)

  return (
    <ContextualPanel
      state={state}
      venues={venues}
      shuttleRoutesAvailable={networkIndex.routes.length > 0}
      renderShuttleRoutes={(selectRef) => renderShuttleRoutes(
        selectRef,
        network,
        networkIndex,
        null,
        () => undefined,
      )}
      minimized={minimized}
      onRestore={() => setMinimized(false)}
      onQueryChange={(query) => setState((current) => ({ ...current, query }))}
      onVenueSelect={() => undefined}
      onOpenVenueSearch={() => undefined}
      onOpenShuttle={() => undefined}
      onBack={() => undefined}
      onClose={() => undefined}
      onEscape={() => undefined}
    />
  )
}

afterEach(cleanup)

describe('ContextualPanel accessibility workflows', () => {
  it('shows successful resource counts in Explore and Shuttle modes but not venue detail', async () => {
    const status: PanelStatus = {
      kind: 'success',
      message: '42 venues · 33 shuttle stops · 8 shuttle routes loaded',
    }
    const { rerender } = render(<PanelHarness status={status} />)

    expect(screen.getByText('42 venues · 33 shuttle stops · 8 shuttle routes loaded')).toBeTruthy()

    const shuttleState = {
      ...createInitialContextualPanelState(),
      mode: 'shuttle' as const,
    }
    rerender(<PanelHarness initialState={shuttleState} status={status} />)
    expect(screen.getByText('42 venues · 33 shuttle stops · 8 shuttle routes loaded')).toBeTruthy()

    const detailState = {
      ...createInitialContextualPanelState(),
      mode: 'venue-detail' as const,
      selectedVenue: {
        code: 'COM1-0210',
        venue: venues['COM1-0210'],
      },
    }
    cleanup()
    render(<PanelHarness initialState={detailState} status={status} />)
    expect(screen.queryByText('42 venues · 33 shuttle stops · 8 shuttle routes loaded')).toBeNull()
  })

  it('shows loading in every mode and announces failures with a minimized indicator', () => {
    const loading: PanelStatus = {
      kind: 'loading',
      message: 'Loading map data…',
    }
    render(<PanelHarness status={loading} />)
    expect(screen.getByText('Loading map data…')).toBeTruthy()

    const failed: PanelStatus = {
      kind: 'failure',
      message: 'Unable to load map tiles; Unable to load venue data',
    }
    const detailState = {
      ...createInitialContextualPanelState(),
      mode: 'venue-detail' as const,
      selectedVenue: {
        code: 'COM1-0210',
        venue: venues['COM1-0210'],
      },
    }
    cleanup()
    render(<PanelHarness initialState={detailState} status={failed} />)
    expect(screen.getByText(/Unable to load map tiles/)).toBeTruthy()

    cleanup()
    render(<PanelHarness status={failed} minimized />)
    expect(screen.getByLabelText(/Map data unavailable/)).toBeTruthy()
  })

  it('announces structured startup failure and keeps its minimized indicator', () => {
    render(<PanelHarness status={{ kind: 'failure', message: 'Unable to start map navigation' }} />)
    expect(screen.getByText('Unable to start map navigation')).toBeTruthy()

    cleanup()
    render(
      <PanelHarness
        status={{ kind: 'failure', message: 'Unable to start map navigation' }}
        minimized
      />,
    )
    expect(screen.getByLabelText(/Map data unavailable/)).toBeTruthy()
  })

  it('minimizes to an actionable header and restores the current search with safe focus', async () => {
    const user = userEvent.setup()
    render(<MinimizedPanelHarness />)

    const panel = screen.getByRole('region', { name: 'Explore NUS' })
    expect(panel.getAttribute('data-minimized')).toBe('true')
    expect(panel.querySelector('.contextual-panel-content')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Show contextual panel' }))

    const search = await screen.findByRole('searchbox', { name: 'Find a venue' })
    await waitFor(() => expect(document.activeElement).toBe(search))
    expect((search as HTMLInputElement).value).toBe('COM1')
    expect(panel.getAttribute('data-minimized')).toBe('false')
  })

  it('preserves an endpoint input when a minimized mobile sheet becomes desktop content', async () => {
    const network = createValidTransitNetwork()
    const networkIndex = createTransitIndex(network)
    const state = createInitialContextualPanelState()
    const panelProps = {
      state,
      venues,
      shuttleRoutesAvailable: networkIndex.routes.length > 0,
      renderShuttleRoutes: (selectRef: RefObject<HTMLSelectElement | null>) => renderShuttleRoutes(
        selectRef,
        network,
        networkIndex,
        null,
        () => undefined,
      ),
      onQueryChange: () => undefined,
      onVenueSelect: () => undefined,
      onOpenVenueSearch: () => undefined,
      onOpenShuttle: () => undefined,
      onBack: () => undefined,
      onClose: () => undefined,
      onEscape: () => undefined,
    }
    const { rerender } = render(
      <>
        <input aria-label="Trip endpoint input" />
        <ContextualPanel {...panelProps} minimized mobileViewport />
      </>,
    )
    const endpointInput = screen.getByRole('textbox', { name: 'Trip endpoint input' })
    endpointInput.focus()

    rerender(
      <>
        <input aria-label="Trip endpoint input" />
        <ContextualPanel {...panelProps} minimized={false} mobileViewport={false} />
      </>,
    )

    await waitFor(() => expect(document.activeElement).toBe(endpointInput))
    expect(screen.queryByRole('button', { name: 'Show contextual panel' })).toBeNull()
  })

  it('preserves visible contextual, map, and other control focus when entering mobile', async () => {
    const { rerender } = render(
      <PanelWithOutsideControls>
        <PanelHarness mobileViewport={false} />
      </PanelWithOutsideControls>,
    )
    const mapControl = screen.getByRole('button', { name: 'Map control' })
    const contextualSearch = screen.getByRole('searchbox', { name: 'Find a venue' })
    const otherControl = screen.getByRole('button', { name: 'Other visible control' })

    mapControl.focus()
    rerender(
      <PanelWithOutsideControls>
        <PanelHarness mobileViewport />
      </PanelWithOutsideControls>,
    )
    await waitFor(() => expect(document.activeElement).toBe(mapControl))

    contextualSearch.focus()
    rerender(
      <PanelWithOutsideControls>
        <PanelHarness mobileViewport={false} />
      </PanelWithOutsideControls>,
    )
    rerender(
      <PanelWithOutsideControls>
        <PanelHarness mobileViewport />
      </PanelWithOutsideControls>,
    )
    await waitFor(() => expect(document.activeElement).toBe(contextualSearch))

    otherControl.focus()
    rerender(
      <PanelWithOutsideControls>
        <PanelHarness mobileViewport={false} />
      </PanelWithOutsideControls>,
    )
    rerender(
      <PanelWithOutsideControls>
        <PanelHarness mobileViewport />
      </PanelWithOutsideControls>,
    )
    await waitFor(() => expect(document.activeElement).toBe(otherControl))
  })

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
