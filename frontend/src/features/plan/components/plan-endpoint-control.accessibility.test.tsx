// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanContentHarness as PlanContent } from './plan-content-harness'
import { PlanEndpointControl } from './plan-endpoint-control'
import { createTransitIndex } from '../../../domain/transit'
import { createValidTransitNetwork } from '../../../domain/transit/test-fixtures'
import {
  clearTripEndpoint,
  createEmptyTripRequest,
  setTripEndpoint,
  swapTripEndpoints,
} from '../../../domain/trip/endpoints'
import type { TripRequest } from '../../../domain/trip/types'
import type { VenueLocationMap } from '@navus/shared/venue/types'

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
    <section aria-label="Trip endpoints">
      <PlanContent
        tripRequest={tripRequest}
        venues={venues}
        networkIndex={networkIndex}
        onSwap={() => setTripRequest((current) => swapTripEndpoints(current))}
        onSelectOriginEndpoint={(endpoint) => setTripRequest((current) => setTripEndpoint(current, 'origin', endpoint))}
        onClearOriginEndpoint={() => setTripRequest((current) => clearTripEndpoint(current, 'origin'))}
        onSelectDestinationEndpoint={(endpoint) => setTripRequest((current) => setTripEndpoint(current, 'destination', endpoint))}
        onClearDestinationEndpoint={() => setTripRequest((current) => clearTripEndpoint(current, 'destination'))}
        onClearTrip={() => setTripRequest(createEmptyTripRequest())}
        onPlanJourney={() => undefined}
      />
    </section>
  )
}

afterEach(cleanup)

describe('PlanContent interactions', () => {
  it.each([
    { displayName: 'COM 3', stopIndex: 0, stopId: 'STOP-A' },
    { displayName: 'BIZ 2', stopIndex: 1, stopId: 'STOP-B' },
  ])('distinguishes a $displayName venue and bus stop with the same displayed name', async ({
    displayName,
    stopIndex,
    stopId,
  }) => {
    const user = userEvent.setup()
    const collidingVenue: VenueLocationMap = {
      [displayName]: {
        roomName: displayName,
        location: { x: 103.77, y: 1.3 },
      },
    }
    const network = createValidTransitNetwork()
    network.stops[stopIndex] = { ...network.stops[stopIndex], longName: displayName, shortName: displayName }
    const networkIndex = createTransitIndex(network)
    const onSelect = vi.fn()
    render(
      <PlanEndpointControl
        role="origin"
        endpoint={null}
        venues={collidingVenue}
        networkIndex={networkIndex}
        searchQuery={displayName}
        onSearchQueryChange={() => undefined}
        onSelect={onSelect}
        onClear={() => undefined}
      />,
    )

    const venueResult = screen.getByRole('button', { name: `Set origin to ${displayName}, venue` })
    const stopResult = screen.getByRole('button', { name: `Set origin to ${displayName}, bus stop, ${stopId}` })
    expect(venueResult.querySelector('.location-identity-icon--venue[aria-hidden="true"]')).toBeTruthy()
    expect(stopResult.querySelector('.location-identity-icon--stop[aria-hidden="true"]')).toBeTruthy()
    await user.click(stopResult)
    await user.click(venueResult)
    expect(onSelect).toHaveBeenNthCalledWith(1, { kind: 'stop', id: stopId })
    expect(onSelect).toHaveBeenNthCalledWith(2, { kind: 'venue', id: displayName })

    cleanup()
    const selectedStop = { kind: 'stop', id: stopId } as const
    const { container: selectedContainer } = render(
      <PlanEndpointControl
        role="origin"
        endpoint={selectedStop}
        venues={collidingVenue}
        networkIndex={networkIndex}
        searchQuery=""
        onSearchQueryChange={() => undefined}
        onSelect={() => undefined}
        onClear={() => undefined}
      />,
    )

    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value).toBe(displayName)
    expect(screen.getByRole('status').textContent).toBe(`Origin set to ${displayName}, bus stop (${stopId}).`)
    expect(selectedContainer.querySelector('.location-identity-icon--stop[aria-hidden="true"]')).toBeTruthy()

    cleanup()
    const selectedVenue = { kind: 'venue', id: displayName } as const
    const { container: venueContainer } = render(
      <PlanEndpointControl
        role="destination"
        endpoint={selectedVenue}
        venues={collidingVenue}
        networkIndex={networkIndex}
        searchQuery=""
        onSearchQueryChange={() => undefined}
        onSelect={() => undefined}
        onClear={() => undefined}
      />,
    )

    expect((screen.getByRole('searchbox', { name: 'Destination' }) as HTMLInputElement).value).toBe(displayName)
    expect(screen.getByRole('status').textContent).toBe(`Destination set to ${displayName}, venue (${displayName}).`)
    expect(venueContainer.querySelector('.location-identity-icon--venue[aria-hidden="true"]')).toBeTruthy()
  })

  it('shows endpoint validation only after Get route is pressed', async () => {
    const user = userEvent.setup()
    const onPlanJourney = vi.fn()
    const controls = {
      venues,
      networkIndex: createTransitIndex(createValidTransitNetwork()),
      onSwap: () => undefined,
      onSelectOriginEndpoint: () => undefined,
      onClearOriginEndpoint: () => undefined,
      onSelectDestinationEndpoint: () => undefined,
      onClearDestinationEndpoint: () => undefined,
      onClearTrip: () => undefined,
      onPlanJourney,
    }

    const { rerender } = render(
      <PlanContent
        {...controls}
        tripRequest={{
          origin: { kind: 'venue', id: 'COM1-0210' },
          destination: { kind: 'stop', id: 'STOP-A' },
        }}
      />,
    )

    expect(screen.queryByText('Origin and destination are set.')).toBeNull()
    rerender(<PlanContent {...controls} tripRequest={{ origin: null, destination: null }} />)
    expect(screen.queryByText('Origin is required.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Trip actions' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()

    const submit = screen.getByRole('button', { name: 'Get route' })
    await user.click(submit)
    expect(onPlanJourney).not.toHaveBeenCalled()
    const validation = screen.getByText('Origin is required.')
    expect(validation.getAttribute('role')).toBe('status')
    expect(validation.getAttribute('aria-live')).toBe('polite')
  })

  it('clears the Get route validation message once the missing endpoint is filled', async () => {
    const user = userEvent.setup()
    const controls = {
      venues,
      networkIndex: createTransitIndex(createValidTransitNetwork()),
      onSwap: () => undefined,
      onSelectOriginEndpoint: () => undefined,
      onClearOriginEndpoint: () => undefined,
      onSelectDestinationEndpoint: () => undefined,
      onClearDestinationEndpoint: () => undefined,
      onClearTrip: () => undefined,
      onPlanJourney: () => undefined,
    }

    const { rerender } = render(
      <PlanContent {...controls} tripRequest={{ origin: null, destination: null }} />,
    )
    await user.click(screen.getByRole('button', { name: 'Get route' }))
    expect(screen.getByText('Origin is required.')).toBeTruthy()

    rerender(
      <PlanContent
        {...controls}
        tripRequest={{ origin: { kind: 'venue', id: 'COM1-0210' }, destination: null }}
      />,
    )
    expect(screen.getByText('Destination is required.')).toBeTruthy()

    rerender(
      <PlanContent
        {...controls}
        tripRequest={{
          origin: { kind: 'venue', id: 'COM1-0210' },
          destination: { kind: 'stop', id: 'STOP-A' },
        }}
      />,
    )
    expect(screen.queryByText('Destination is required.')).toBeNull()
  })

  it('uses Get route as the explicit planning action', async () => {
    const user = userEvent.setup()
    const onPlanJourney = vi.fn()
    const controls = {
      venues,
      networkIndex: createTransitIndex(createValidTransitNetwork()),
      tripRequest: {
        origin: { kind: 'venue' as const, id: 'COM1-0210' },
        destination: { kind: 'stop' as const, id: 'STOP-A' },
      },
      onSwap: () => undefined,
      onSelectOriginEndpoint: () => undefined,
      onClearOriginEndpoint: () => undefined,
      onSelectDestinationEndpoint: () => undefined,
      onClearDestinationEndpoint: () => undefined,
      onClearTrip: () => undefined,
      onPlanJourney,
    }

    const { rerender } = render(<PlanContent {...controls} />)
    const submit = screen.getByRole('button', { name: 'Get route' })
    expect((submit as HTMLButtonElement).disabled).toBe(false)
    await user.click(submit)
    expect(onPlanJourney).toHaveBeenCalledOnce()

    rerender(<PlanContent {...controls} path={{
      status: 'loading',
      path: null,
      candidates: [],
      error: null,
    }} />)
    expect((screen.getByRole('button', { name: 'Get route' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('dismisses trip actions when focus moves outside the popover', async () => {
    const user = userEvent.setup()
    render(<TripEndpointHarness />)

    const actions = screen.getByRole('button', { name: 'Trip actions' })
    await user.click(actions)
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeTruthy()

    await user.click(screen.getByRole('heading', { name: 'Plan trip' }))
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
  })

  it('offers a retryable current-location action for the origin', async () => {
    const user = userEvent.setup()
    const onUseCurrentLocationForOrigin = vi.fn()
    const controls = {
      venues,
      networkIndex: createTransitIndex(createValidTransitNetwork()),
      tripRequest: { origin: null, destination: null },
      onSwap: () => undefined,
      onSelectOriginEndpoint: () => undefined,
      onClearOriginEndpoint: () => undefined,
      onSelectDestinationEndpoint: () => undefined,
      onClearDestinationEndpoint: () => undefined,
      onClearTrip: () => undefined,
      onPlanJourney: () => undefined,
      onUseCurrentLocationForOrigin,
    }

    const { rerender } = render(<PlanContent {...controls} />)
    await user.click(screen.getByRole('button', { name: 'Use current location' }))
    expect(onUseCurrentLocationForOrigin).toHaveBeenCalledOnce()

    rerender(<PlanContent
      {...controls}
      originLocationRequest={{ status: 'requesting', error: null }}
    />)
    expect((screen.getByRole('button', { name: 'Getting current location' }) as HTMLButtonElement).disabled).toBe(true)

    rerender(<PlanContent
      {...controls}
      originLocationRequest={{
        status: 'error',
        error: 'Device location is unavailable. Please try again.',
      }}
    />)
    expect(screen.getByText('Device location is unavailable. Please try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry current location' })).toBeTruthy()

    rerender(<PlanContent
      {...controls}
      tripRequest={{
        origin: {
          kind: 'current-location',
          coordinate: { longitude: 103.12345, latitude: 1.23456 },
        },
        destination: null,
      }}
    />)
    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value)
      .toBe('Current location')
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
  })

  it('keeps the Plan trip heading compact after endpoints are selected', () => {
    render(
      <PlanContent
        tripRequest={{
          origin: { kind: 'venue', id: 'COM1-0210' },
          destination: { kind: 'stop', id: 'STOP-A' },
        }}
        venues={venues}
        networkIndex={createTransitIndex(createValidTransitNetwork())}
        onSwap={() => undefined}
        onSelectOriginEndpoint={() => undefined}
        onClearOriginEndpoint={() => undefined}
        onSelectDestinationEndpoint={() => undefined}
        onClearDestinationEndpoint={() => undefined}
        onClearTrip={() => undefined}
        onPlanJourney={() => undefined}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Plan trip' })).toBeTruthy()
    expect(screen.queryByText('Computing 1, Level 2 to Stop A')).toBeNull()
  })

  it('keeps empty endpoint results in a labelled group with native semantics', async () => {
    const user = userEvent.setup()
    render(<TripEndpointHarness />)

    await user.type(screen.getByRole('searchbox', { name: 'Origin' }), 'not-a-location')

    expect(screen.getByRole('group', { name: 'Origin search results' })).toBeTruthy()
    expect(screen.getByText('No matching venues or bus stops')).toBeTruthy()
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
    const originResult = screen.getByRole('button', { name: 'Set origin to COM1-0210, venue' })
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(originResult)
    await user.keyboard('{Enter}')
    expect((within(screen.getByRole('region', { name: 'Origin' }))
      .getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value)
      .toBe('Computing 1, Level 2')

    const destinationSearch = screen.getByRole('searchbox', { name: 'Destination' })
    await user.type(destinationSearch, 'STOP-A')
    const destinationResult = screen.getByRole('button', { name: 'Set destination to Stop A, bus stop, STOP-A' })
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

    const actions = screen.getByRole('button', { name: 'Trip actions' })
    actions.focus()
    await user.keyboard('{Enter}')
    expect(actions.getAttribute('aria-expanded')).toBe('true')
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
    await user.click(screen.getByRole('button', { name: 'Set origin to COM1-0210, venue' }))

    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value)
      .toBe('Computing 1, Level 2')
    await user.click(screen.getByRole('button', { name: 'Clear origin' }))

    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Clear origin' })).toBeNull()
  })
})
