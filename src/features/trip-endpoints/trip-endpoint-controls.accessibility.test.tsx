// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanView } from './plan-view'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import {
  clearTripEndpoint,
  createEmptyTripRequest,
  setTripEndpoint,
  swapTripEndpoints,
} from '../../domain/trip/endpoints'
import type { TripRequest } from '../../domain/trip/types'
import type { VenueLocationMap } from '../../domain/venue/types'
import type { MobileSheetDetent } from '../../ui/mobile-sheet-detent'

const venues: VenueLocationMap = {
  'COM1-0210': {
    roomName: 'Computing 1, Level 2',
    location: { x: 103.77, y: 1.3 },
  },
}

function TripEndpointHarness() {
  const [tripRequest, setTripRequest] = useState<TripRequest>(createEmptyTripRequest())
  const network = createValidTransitNetwork()
  const networkIndex = createTransitIndex(network)

  return (
    <PlanView
      tripRequest={tripRequest}
      venues={venues}
      networkIndex={networkIndex}
      onSwap={() => setTripRequest((current) => swapTripEndpoints(current))}
      onSelectOriginEndpoint={(endpoint) => setTripRequest((current) => setTripEndpoint(current, 'origin', endpoint))}
      onClearOriginEndpoint={() => setTripRequest((current) => clearTripEndpoint(current, 'origin'))}
      onSelectDestinationEndpoint={(endpoint) => setTripRequest((current) => setTripEndpoint(current, 'destination', endpoint))}
      onClearDestinationEndpoint={() => setTripRequest((current) => clearTripEndpoint(current, 'destination'))}
      onClearTrip={() => setTripRequest(createEmptyTripRequest())}
    />
  )
}

afterEach(cleanup)

describe('TripEndpointControls interactions', () => {
  it('provides a labelled collapsed plan summary for empty endpoints and a stable toggle', async () => {
    const user = userEvent.setup()
    function CollapsedHarness() {
      const [detent, setDetent] = useState<MobileSheetDetent>('collapsed')
      return (
        <PlanView
          tripRequest={{ origin: null, destination: null }}
          venues={venues}
          networkIndex={createTransitIndex(createValidTransitNetwork())}
          detent={detent}
          onDetentChange={setDetent}
          onSwap={() => undefined}
          onSelectOriginEndpoint={() => undefined}
          onClearOriginEndpoint={() => undefined}
          onSelectDestinationEndpoint={() => undefined}
          onClearDestinationEndpoint={() => undefined}
          onClearTrip={() => undefined}
        />
      )
    }

    render(<CollapsedHarness />)

    const toggle = screen.getByRole('button', { name: /Plan trip/ })
    expect(toggle.getAttribute('aria-controls')).toBe('trip-controls-panel-content')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('Choose origin → Choose destination')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Trip endpoints' })
      .querySelector('.trip-controls-body')?.getAttribute('data-expanded')).toBe('false')

    await user.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-description')).toBe('Opens the full-height sheet.')
    expect(document.activeElement).toBe(toggle)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Origin' }))

    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle)
  })

  it('reports search focus, cancel, and result selection for sheet detent transitions', async () => {
    const user = userEvent.setup()
    const onSearchFocus = vi.fn()
    const onSearchCancel = vi.fn()
    const onSearchResult = vi.fn()
    function SearchTransitionHarness() {
      const [detent, setDetent] = useState<MobileSheetDetent>('partial')
      const [searchDetent, setSearchDetent] = useState<MobileSheetDetent>('partial')
      return (
        <PlanView
          tripRequest={{ origin: null, destination: null }}
          venues={venues}
          networkIndex={createTransitIndex(createValidTransitNetwork())}
          detent={detent}
          onDetentChange={setDetent}
          onSearchFocus={() => {
            onSearchFocus()
            setSearchDetent(detent)
            setDetent('full')
          }}
          onSearchCancel={() => {
            onSearchCancel()
            setDetent(searchDetent)
          }}
          onSearchResult={() => {
            onSearchResult()
            setDetent('partial')
          }}
          onSwap={() => undefined}
          onSelectOriginEndpoint={() => undefined}
          onClearOriginEndpoint={() => undefined}
          onSelectDestinationEndpoint={() => undefined}
          onClearDestinationEndpoint={() => undefined}
          onClearTrip={() => undefined}
        />
      )
    }

    render(<SearchTransitionHarness />)
    const sheet = screen.getByRole('region', { name: 'Trip endpoints' })
    const origin = screen.getByRole('searchbox', { name: 'Origin' })
    await user.click(origin)

    expect(onSearchFocus).toHaveBeenCalledOnce()
    expect(sheet.getAttribute('data-detent')).toBe('full')
    await user.keyboard('{Escape}')
    expect(onSearchCancel).toHaveBeenCalledOnce()
    expect(sheet.getAttribute('data-detent')).toBe('partial')

    origin.blur()
    await user.type(origin, 'COM1')

    expect(onSearchFocus).toHaveBeenCalledTimes(2)
    expect(sheet.getAttribute('data-detent')).toBe('full')
    await user.keyboard('{Escape}')
    expect(onSearchCancel).toHaveBeenCalledTimes(2)
    expect(sheet.getAttribute('data-detent')).toBe('partial')

    await user.type(origin, 'COM1')
    await user.click(screen.getByRole('button', { name: 'Set origin to COM1-0210' }))
    expect(onSearchResult).toHaveBeenCalledOnce()
    expect(sheet.getAttribute('data-detent')).toBe('partial')
  })

  it('only shows endpoint validation when the request needs attention', () => {
    const networkIndex = createTransitIndex(createValidTransitNetwork())
    const controls = {
      venues,
      networkIndex,
      onExpandedChange: () => undefined,
      onSwap: () => undefined,
      onSelectOriginEndpoint: () => undefined,
      onClearOriginEndpoint: () => undefined,
      onSelectDestinationEndpoint: () => undefined,
      onClearDestinationEndpoint: () => undefined,
      onClearTrip: () => undefined,
    }

    const { rerender } = render(
      <PlanView
        {...controls}
        tripRequest={{
          origin: { kind: 'venue', id: 'COM1-0210' },
          destination: { kind: 'stop', id: 'STOP-A' },
        }}
      />,
    )

    expect(screen.queryByText('Origin and destination are set.')).toBeNull()
    rerender(<PlanView {...controls} tripRequest={{ origin: null, destination: null }} />)
    const validation = screen.getByText('Origin is required.')
    expect(validation).toBeTruthy()
    expect(within(validation.parentElement as HTMLElement)
      .getByRole('button', { name: 'Clear all' }))
      .toBeTruthy()
  })

  it('uses Escape to dismiss endpoint search results before collapsing the plan sheet', async () => {
    const user = userEvent.setup()
    render(<TripEndpointHarness />)

    const origin = screen.getByRole('searchbox', { name: 'Origin' })
    await user.type(origin, 'COM1')
    expect(screen.getByRole('button', { name: /COM1-0210/ })).toBeTruthy()

    await user.keyboard('{Escape}')

    expect((origin as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: /COM1-0210/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Plan trip/ }).getAttribute('aria-expanded'))
      .toBe('true')
  })

  it('keeps full endpoint names available while visually truncating a complete summary', () => {
    const longVenue = {
      ...venues,
      'COM1-0210': {
        roomName: 'A very long venue name used to verify accessible endpoint summaries',
        location: { x: 103.77, y: 1.3 },
      },
    }
    const networkIndex = createTransitIndex(createValidTransitNetwork())
    render(
      <PlanView
        tripRequest={{
          origin: { kind: 'venue', id: 'COM1-0210' },
          destination: { kind: 'stop', id: 'STOP-A' },
        }}
        venues={longVenue}
        networkIndex={networkIndex}
        expanded={false}
        onExpandedChange={() => undefined}
        onSwap={() => undefined}
        onSelectOriginEndpoint={() => undefined}
        onClearOriginEndpoint={() => undefined}
        onSelectDestinationEndpoint={() => undefined}
        onClearDestinationEndpoint={() => undefined}
        onClearTrip={() => undefined}
      />,
    )

    const toggle = screen.getByRole('button', { name: /Plan trip/ })
    expect(toggle.getAttribute('aria-label')).toContain(
      'A very long venue name used to verify accessible endpoint summaries',
    )
    expect(toggle.getAttribute('aria-label')).toContain('Stop A')
    expect(screen.getByText(/A very long venue name/, { selector: '.trip-controls-summary' }).className)
      .toContain('trip-controls-summary')
  })

  it('preserves contextual and map focus when entering mobile while the trip card is collapsed', async () => {
    const props = {
      tripRequest: { origin: null, destination: null },
      venues,
      networkIndex: createTransitIndex(createValidTransitNetwork()),
      expanded: false,
      onExpandedChange: () => undefined,
      onSwap: () => undefined,
      onSelectOriginEndpoint: () => undefined,
      onClearOriginEndpoint: () => undefined,
      onSelectDestinationEndpoint: () => undefined,
      onClearDestinationEndpoint: () => undefined,
      onClearTrip: () => undefined,
    }
    const { rerender } = render(
      <>
        <button type="button">Map control</button>
        <input aria-label="Contextual panel search" />
        <button type="button">Contextual action</button>
        <PlanView {...props} mobileViewport={false} />
      </>,
    )

    const mapControl = screen.getByRole('button', { name: 'Map control' })
    const contextualSearch = screen.getByRole('textbox', { name: 'Contextual panel search' })

    mapControl.focus()
    rerender(
      <>
        <button type="button">Map control</button>
        <input aria-label="Contextual panel search" />
        <button type="button">Contextual action</button>
        <PlanView {...props} mobileViewport />
      </>,
    )
    await waitFor(() => expect(document.activeElement).toBe(mapControl))

    contextualSearch.focus()
    rerender(
      <>
        <button type="button">Map control</button>
        <input aria-label="Contextual panel search" />
        <button type="button">Contextual action</button>
        <PlanView {...props} mobileViewport={false} />
      </>,
    )
    rerender(
      <>
        <button type="button">Map control</button>
        <input aria-label="Contextual panel search" />
        <button type="button">Contextual action</button>
        <PlanView {...props} mobileViewport />
      </>,
    )
    await waitFor(() => expect(document.activeElement).toBe(contextualSearch))

    const contextualAction = screen.getByRole('button', { name: 'Contextual action' })
    contextualAction.focus()
    rerender(
      <>
        <button type="button">Map control</button>
        <input aria-label="Contextual panel search" />
        <button type="button">Contextual action</button>
        <PlanView {...props} mobileViewport={false} />
      </>,
    )
    rerender(
      <>
        <button type="button">Map control</button>
        <input aria-label="Contextual panel search" />
        <button type="button">Contextual action</button>
        <PlanView {...props} mobileViewport />
      </>,
    )
    await waitFor(() => expect(document.activeElement).toBe(contextualAction))
  })

  it('moves an endpoint input to the same visible input when leaving mobile for desktop', async () => {
    const props = {
      tripRequest: { origin: null, destination: null },
      venues,
      networkIndex: createTransitIndex(createValidTransitNetwork()),
      expanded: true,
      mobileViewport: true,
      onExpandedChange: () => undefined,
      onSwap: () => undefined,
      onSelectOriginEndpoint: () => undefined,
      onClearOriginEndpoint: () => undefined,
      onSelectDestinationEndpoint: () => undefined,
      onClearDestinationEndpoint: () => undefined,
      onClearTrip: () => undefined,
    }
    const { rerender } = render(<PlanView {...props} />)
    const destinationSearch = screen.getByRole('searchbox', { name: 'Destination' })
    destinationSearch.focus()

    rerender(<PlanView {...props} expanded={false} mobileViewport={false} />)
    await waitFor(() => expect(document.activeElement).toBe(destinationSearch))
  })

  it('labels a partial summary with the selected origin and a destination prompt', () => {
    render(
      <PlanView
        tripRequest={{ origin: { kind: 'venue', id: 'COM1-0210' }, destination: null }}
        venues={venues}
        networkIndex={createTransitIndex(createValidTransitNetwork())}
        expanded={false}
        onExpandedChange={() => undefined}
        onSwap={() => undefined}
        onSelectOriginEndpoint={() => undefined}
        onClearOriginEndpoint={() => undefined}
        onSelectDestinationEndpoint={() => undefined}
        onClearDestinationEndpoint={() => undefined}
        onClearTrip={() => undefined}
      />,
    )

    expect(screen.getByText('Computing 1, Level 2 → Choose destination')).toBeTruthy()
  })

  it('labels a complete summary with both selected endpoint names', () => {
    render(
      <PlanView
        tripRequest={{
          origin: { kind: 'venue', id: 'COM1-0210' },
          destination: { kind: 'stop', id: 'STOP-A' },
        }}
        venues={venues}
        networkIndex={createTransitIndex(createValidTransitNetwork())}
        expanded={false}
        onExpandedChange={() => undefined}
        onSwap={() => undefined}
        onSelectOriginEndpoint={() => undefined}
        onClearOriginEndpoint={() => undefined}
        onSelectDestinationEndpoint={() => undefined}
        onClearDestinationEndpoint={() => undefined}
        onClearTrip={() => undefined}
      />,
    )

    expect(screen.getByText('Computing 1, Level 2 → Stop A')).toBeTruthy()
  })

  it('keeps empty endpoint results in a labelled group with native semantics', async () => {
    const user = userEvent.setup()
    render(<TripEndpointHarness />)

    await user.type(screen.getByRole('searchbox', { name: 'Origin' }), 'not-a-location')

    expect(screen.getByRole('group', { name: 'Origin search results' })).toBeTruthy()
    expect(screen.getByText('No matching venues or shuttle stops')).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('supports keyboard-search selection, swap, clear, and native endpoint semantics', async () => {
    const user = userEvent.setup()
    render(<TripEndpointHarness />)

    const originSearch = screen.getByRole('searchbox', { name: 'Origin' })
    await user.type(originSearch, 'COM1')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('group', { name: 'Origin search results' })).toBeTruthy()
    const originResult = screen.getByRole('button', { name: 'Set origin to COM1-0210' })
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(originResult)
    await user.keyboard('{Enter}')
    expect((within(screen.getByRole('region', { name: 'Origin' }))
      .getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value)
      .toBe('Computing 1, Level 2')

    const destinationSearch = screen.getByRole('searchbox', { name: 'Destination' })
    await user.type(destinationSearch, 'STOP-A')
    const destinationResult = screen.getByRole('button', { name: 'Set destination to STOP-A' })
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(destinationResult)
    await user.keyboard('{Enter}')
    expect((within(screen.getByRole('region', { name: 'Destination' }))
      .getByRole('searchbox', { name: 'Destination' }) as HTMLInputElement).value)
      .toBe('Stop A')

    const swap = screen.getByRole('button', { name: 'Swap origin and destination' })
    expect((swap as HTMLButtonElement).disabled).toBe(false)
    await user.click(swap)
    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value).toBe('Stop A')
    expect((screen.getByRole('searchbox', { name: 'Destination' }) as HTMLInputElement).value)
      .toBe('Computing 1, Level 2')

    await user.type(screen.getByRole('searchbox', { name: 'Origin' }), 'STOP')
    await user.type(screen.getByRole('searchbox', { name: 'Destination' }), 'COM1')

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('searchbox', { name: 'Destination' }) as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('group', { name: 'Origin search results' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Destination search results' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Trip endpoints' })).toBeTruthy()
  })

  it('clears a selected endpoint with its inline X control', async () => {
    const user = userEvent.setup()
    render(<TripEndpointHarness />)

    const originSearch = screen.getByRole('searchbox', { name: 'Origin' })
    await user.type(originSearch, 'COM1')
    await user.click(screen.getByRole('button', { name: 'Set origin to COM1-0210' }))

    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value)
      .toBe('Computing 1, Level 2')
    await user.click(screen.getByRole('button', { name: 'Clear origin' }))

    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Clear origin' })).toBeNull()
  })
})
