// @vitest-environment jsdom

import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExploreView } from './explore-view'
import { getExploreShellClassName } from './explore-view-shell'
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

function TestShuttleRouteControl({
  network,
  networkIndex,
  selectedRouteId,
  onRouteSelect,
  firstRouteCardRef,
  onFocusStop,
}: {
  network: TransitNetwork | null
  networkIndex: TransitNetworkIndex | null
  selectedRouteId: string | null
  onRouteSelect: (routeId: string) => void
  firstRouteCardRef: RefObject<HTMLButtonElement | null>
  onFocusStop: (stopId: string) => void
}) {
  const routes = networkIndex?.routes ?? network?.routes ?? []
  const selectedRoute = selectedRouteId && networkIndex
    ? networkIndex.routeById.get(selectedRouteId)
    : undefined
  return (
    <section aria-label="Shuttle route selection">
      <h3 className="visually-hidden">Choose a shuttle route</h3>
      {routes.map((route, index) => (
        <button
          key={route.id}
          ref={index === 0 ? firstRouteCardRef : undefined}
          type="button"
          aria-label={`Route ${route.id}`}
          aria-pressed={selectedRouteId === route.id}
          onClick={() => onRouteSelect(route.id)}
        >
          {route.id}
        </button>
      ))}
      {selectedRoute && (
        <ol aria-label={`Route ${selectedRoute.id} ordered stops`}>
          {selectedRoute.stopIds.map((stopId) => {
            const stop = networkIndex?.stopById.get(stopId)
            return (
              <li key={stopId}>
                <button
                  type="button"
                  aria-label={`${stop?.longName ?? stopId}, stop ${stopId}. Focus on map`}
                  onClick={() => onFocusStop(stopId)}
                >
                  {stop?.longName ?? stopId}
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <p>
        {!network
          ? 'Loading shuttle routes…'
          : selectedRoute
            ? `Route ${selectedRoute.name} selected.`
            : `Showing all ${routes.length} shuttle routes and all ${networkIndex?.stops.length ?? network?.stops.length ?? 0} shuttle stops.`}
      </p>
    </section>
  )
}

function PanelHarness({
  initialState = createInitialContextualPanelState(),
  network: networkOverride,
  networkIndex: networkIndexOverride,
  mobileSheet = true,
  minimized = false,
  active = true,
  status,
  onDismissMapPopup,
  onNavigateToVenue,
}: {
  initialState?: ContextualPanelState
  network?: TransitNetwork | null
  networkIndex?: TransitNetworkIndex | null
  mobileSheet?: boolean
  minimized?: boolean
  active?: boolean
  status?: PanelStatus | null
  onDismissMapPopup?: () => boolean
  onNavigateToVenue?: (venueCode: string) => void
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
    <section
      className={getExploreShellClassName(state, minimized)}
      aria-labelledby="contextual-panel-heading"
      data-minimized={minimized}
    >
      <ExploreView
        state={state}
        venues={venues}
        shuttleRoutesAvailable={(networkIndex?.routes ?? network?.routes ?? []).length > 0}
        renderShuttleRoutes={(options) => (
          <TestShuttleRouteControl
            network={network}
            networkIndex={networkIndex}
            selectedRouteId={selectedRouteId}
            onRouteSelect={setSelectedRouteId}
            firstRouteCardRef={options.firstRouteCardRef}
            onFocusStop={options.onFocusStop}
          />
        )}
        mobileSheet={mobileSheet}
        minimized={minimized}
        active={active}
        status={status}
        onQueryChange={(query) => dispatch({ type: 'set-query', query })}
        onVenueSelect={(result) => dispatch({ type: 'select-venue', result })}
        onNavigateToVenue={onNavigateToVenue}
        onOpenShuttle={() => dispatch({ type: 'open-shuttle' })}
        onLeaveMobileRoutes={() => dispatch({ type: 'close-to-root' })}
        onBack={() => dispatch({ type: 'back' })}
        onEscape={() => dispatch({ type: 'escape' })}
        onDismissMapPopup={onDismissMapPopup}
      />
    </section>
  )
}

function StopPopupHarness() {
  const popupActionRef = useRef<HTMLButtonElement>(null)
  const state = { ...createInitialContextualPanelState(), mode: 'shuttle' as const }

  return (
    <>
      <button ref={popupActionRef} type="button">Popup action</button>
      <ExploreView
        state={state}
        venues={venues}
        shuttleRoutesAvailable
        selectedRouteId="A1"
        renderShuttleRoutes={(options) => (
          <>
            <button
              ref={options.firstRouteCardRef}
              type="button"
              aria-label="Route A1"
              aria-pressed="true"
            >
              A1
            </button>
            <button
              type="button"
              aria-label="Stop A, stop STOP-A. Focus on map"
              onClick={() => options.onFocusStop?.('STOP-A')}
            >
              Stop A
            </button>
          </>
        )}
        onQueryChange={() => undefined}
        onVenueSelect={() => undefined}
        onOpenShuttle={() => undefined}
        onFocusStop={() => popupActionRef.current?.focus()}
        onLeaveMobileRoutes={() => undefined}
        onBack={() => undefined}
        onEscape={() => undefined}
        onDismissMapPopup={() => true}
      />
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

afterEach(cleanup)

describe('ContextualPanel accessibility workflows', () => {
  it('opens mobile Explore on Find venue with a labelled segmented selector', () => {
    render(<PanelHarness initialState={createInitialContextualPanelState()} />)

    expect(screen.getByRole('region', { name: 'Find a venue' })).toBeTruthy()
    const exploreView = screen.getByRole('group', { name: 'Explore view' })
    expect(exploreView).toBeTruthy()
    expect(exploreView.hasAttribute('data-mobile-sheet-content')).toBe(true)
    expect(screen.getByRole('button', { name: 'Find venue' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Shuttle routes' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('searchbox', { name: 'Find a venue' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Explore' })).toBeNull()
  })

  it('does not handle Escape while its tab is inactive', async () => {
    const user = userEvent.setup()
    render(<PanelHarness active={false} />)

    await user.keyboard('{Escape}')

    expect(screen.getByRole('searchbox', { name: 'Find a venue' })).toBeTruthy()
  })

  it('closes a map popup before handling Escape in the current context', async () => {
    const user = userEvent.setup()
    const onDismissMapPopup = vi.fn(() => true)
    render(<PanelHarness
      initialState={createInitialContextualPanelState()}
      onDismissMapPopup={onDismissMapPopup}
    />)

    await user.keyboard('{Escape}')

    expect(onDismissMapPopup).toHaveBeenCalledOnce()
    expect(screen.getByRole('searchbox', { name: 'Find a venue' })).toBeTruthy()
  })

  it('does not show successful resource counts in Explore or Shuttle modes', async () => {
    const status: PanelStatus = {
      kind: 'success',
      message: '42 venues · 33 shuttle stops · 8 shuttle routes loaded',
    }
    const { rerender } = render(<PanelHarness status={status} />)

    expect(screen.queryByText('42 venues · 33 shuttle stops · 8 shuttle routes loaded')).toBeNull()

    const shuttleState = {
      ...createInitialContextualPanelState(),
      mode: 'shuttle' as const,
    }
    rerender(<PanelHarness initialState={shuttleState} status={status} />)
    expect(screen.queryByText('42 venues · 33 shuttle stops · 8 shuttle routes loaded')).toBeNull()

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

  it('preserves visible contextual, map, and other control focus when entering mobile', async () => {
    const { rerender } = render(
      <PanelWithOutsideControls>
        <PanelHarness mobileSheet={false} />
      </PanelWithOutsideControls>,
    )
    const mapControl = screen.getByRole('button', { name: 'Map control' })
    const contextualSearch = screen.getByRole('searchbox', { name: 'Find a venue' })
    const otherControl = screen.getByRole('button', { name: 'Other visible control' })

    mapControl.focus()
    rerender(
      <PanelWithOutsideControls>
        <PanelHarness mobileSheet />
      </PanelWithOutsideControls>,
    )
    await waitFor(() => expect(document.activeElement).toBe(mapControl))

    contextualSearch.focus()
    rerender(
      <PanelWithOutsideControls>
        <PanelHarness mobileSheet={false} />
      </PanelWithOutsideControls>,
    )
    rerender(
      <PanelWithOutsideControls>
        <PanelHarness mobileSheet />
      </PanelWithOutsideControls>,
    )
    await waitFor(() => expect(document.activeElement).toBe(contextualSearch))

    otherControl.focus()
    rerender(
      <PanelWithOutsideControls>
        <PanelHarness mobileSheet={false} />
      </PanelWithOutsideControls>,
    )
    rerender(
      <PanelWithOutsideControls>
        <PanelHarness mobileSheet />
      </PanelWithOutsideControls>,
    )
    await waitFor(() => expect(document.activeElement).toBe(otherControl))
  })

  it('uses labelled native structure for venue search', () => {
    render(<PanelHarness />)
    const search = screen.getByRole('searchbox', { name: 'Find a venue' })

    expect(search).toBeTruthy()

    const panel = screen.getByRole('region', { name: 'Find a venue' })
    expect(panel.getAttribute('aria-labelledby')).toBe('contextual-panel-heading')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Venue search opened.')).toBeTruthy()
    expect(screen.getByText('Search for a venue')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Shuttle routes' })).toBeTruthy()
    expect(screen.queryByText('Search by venue code or room name.')).toBeNull()
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
    const detailHeading = await screen.findByRole('heading', { name: /COM1-0210/ })
    await waitFor(() => expect(document.activeElement).toBe(detailHeading))
    expect(screen.getByText('Venue details opened for COM1-0210.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find venue' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back to venue search' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide contextual panel' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close map context' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Shuttle routes' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Find venue' }))
    const restoredSearch = await screen.findByRole('searchbox', { name: 'Find a venue' })
    await waitFor(() => expect((restoredSearch as HTMLInputElement).value).toBe('COM1'))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /COM1-0210/ })))
  })

  it('passes the selected venue code to Navigate', async () => {
    const user = userEvent.setup()
    const onNavigateToVenue = vi.fn()
    render(<PanelHarness onNavigateToVenue={onNavigateToVenue} />)

    await user.type(screen.getByRole('searchbox', { name: 'Find a venue' }), 'COM1-0210')
    await user.click(screen.getByRole('button', { name: /COM1-0210/ }))
    await user.click(screen.getByRole('button', { name: 'Navigate' }))

    expect(onNavigateToVenue).toHaveBeenCalledWith('COM1-0210')
  })

  it('switches mobile Explore segments and restores focus to the selected segment', async () => {
    const user = userEvent.setup()
    render(<PanelHarness />)

    await user.type(screen.getByRole('searchbox', { name: 'Find a venue' }), 'COM1')
    await user.click(screen.getByRole('button', { name: 'Shuttle routes' }))
    expect(screen.getByRole('button', { name: 'Shuttle routes' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Hide contextual panel' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close map context' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Explore' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Find venue' }))
    const venueSegment = screen.getByRole('button', { name: 'Find venue' })
    expect(venueSegment.getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(venueSegment))
    expect((screen.getByRole('searchbox', { name: 'Find a venue' }) as HTMLInputElement).value)
      .toBe('COM1')
  })

  it('restores the tapped mobile stop row after Escape closes its popup', async () => {
    const user = userEvent.setup()
    render(<StopPopupHarness />)

    const stopRow = screen.getByRole('button', { name: /Stop A, stop STOP-A/ })
    await user.click(stopRow)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Popup action' }))

    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(stopRow)
    expect(screen.getByRole('button', { name: 'Route A1' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps focus on the active segment after switching away from venue search', async () => {
    const user = userEvent.setup()
    render(<PanelHarness />)
    const search = screen.getByRole('searchbox', { name: 'Find a venue' })

    await user.click(screen.getByRole('button', { name: 'Shuttle routes' }))
    expect(search.isConnected).toBe(false)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Shuttle routes' })))
  })

  it('keeps responsive presentation structure semantic without a modal role', () => {
    const { container } = render(<PanelHarness />)
    const panel = container.querySelector('.contextual-panel')

    expect(panel).not.toBeNull()
    expect(panel?.classList.contains('contextual-panel-venue-search')).toBe(true)
    expect(container.querySelector('[aria-modal="true"]')).toBeNull()
  })
})
