// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
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
        onPlanJourney={() => undefined}
      />
    </section>
  )
}

afterEach(cleanup)

describe('PlanView interactions', () => {
  it('only shows endpoint validation when the request needs attention', () => {
    const networkIndex = createTransitIndex(createValidTransitNetwork())
    const controls = {
      venues,
      networkIndex,
      onSwap: () => undefined,
      onSelectOriginEndpoint: () => undefined,
      onClearOriginEndpoint: () => undefined,
      onSelectDestinationEndpoint: () => undefined,
      onClearDestinationEndpoint: () => undefined,
      onClearTrip: () => undefined,
      onPlanJourney: () => undefined,
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
    expect(screen.getByRole('button', { name: 'Trip actions' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
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

    const { rerender } = render(<PlanView {...controls} />)
    const submit = screen.getByRole('button', { name: 'Get route' })
    expect((submit as HTMLButtonElement).disabled).toBe(false)
    await user.click(submit)
    expect(onPlanJourney).toHaveBeenCalledOnce()

    rerender(<PlanView {...controls} journey={{ status: 'loading', journey: null, error: null }} />)
    expect((screen.getByRole('button', { name: 'Get route' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers a retryable nearest-venue location action for the origin', async () => {
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

    const { rerender } = render(<PlanView {...controls} />)
    await user.click(screen.getByRole('button', { name: 'Use current location' }))
    expect(onUseCurrentLocationForOrigin).toHaveBeenCalledOnce()

    rerender(<PlanView
      {...controls}
      originVenueAutofill={{ status: 'requesting', error: null }}
    />)
    expect((screen.getByRole('button', { name: 'Finding nearest venue' }) as HTMLButtonElement).disabled).toBe(true)

    rerender(<PlanView
      {...controls}
      originVenueAutofill={{
        status: 'error',
        error: 'Device location is unavailable. Please try again.',
      }}
    />)
    expect(screen.getByText('Device location is unavailable. Please try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry nearest venue' })).toBeTruthy()
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
      <PlanView
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
    await user.click(screen.getByRole('button', { name: 'Set origin to COM1-0210' }))

    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value)
      .toBe('Computing 1, Level 2')
    await user.click(screen.getByRole('button', { name: 'Clear origin' }))

    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Clear origin' })).toBeNull()
  })
})
