// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { TripEndpointControls } from './TripEndpointControl'
import { createTransitIndex } from '../domain/transit'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import {
  clearTripEndpoint,
  createEmptyTripRequest,
  setTripEndpoint,
  swapTripEndpoints,
} from '../domain/trip/endpoints'
import type { TripRequest } from '../domain/trip/types'
import type { VenueLocationMap } from '../domain/venue/types'

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
    <TripEndpointControls
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
    expect(within(screen.getByRole('region', { name: 'Origin' })).getByText('Computing 1, Level 2')).toBeTruthy()
    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value).toBe('')

    const destinationSearch = screen.getByRole('searchbox', { name: 'Destination' })
    await user.type(destinationSearch, 'STOP-A')
    const destinationResult = screen.getByRole('button', { name: 'Set destination to STOP-A' })
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(destinationResult)
    await user.keyboard('{Enter}')
    expect(within(screen.getByRole('region', { name: 'Destination' })).getByText('Stop A')).toBeTruthy()
    expect((screen.getByRole('searchbox', { name: 'Destination' }) as HTMLInputElement).value).toBe('')

    const swap = screen.getByRole('button', { name: 'Swap origin and destination' })
    expect((swap as HTMLButtonElement).disabled).toBe(false)
    await user.click(swap)
    expect(within(screen.getByRole('region', { name: 'Origin' })).getByText('Stop A')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Destination' })).getByText('Computing 1, Level 2')).toBeTruthy()

    await user.type(screen.getByRole('searchbox', { name: 'Origin' }), 'STOP')
    await user.type(screen.getByRole('searchbox', { name: 'Destination' }), 'COM1')

    await user.click(screen.getByRole('button', { name: 'Clear both endpoints' }))
    expect(screen.getByText('No origin selected')).toBeTruthy()
    expect(screen.getByText('No destination selected')).toBeTruthy()
    expect((screen.getByRole('searchbox', { name: 'Origin' }) as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('searchbox', { name: 'Destination' }) as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('group', { name: 'Origin search results' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Destination search results' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Trip endpoints' })).toBeTruthy()
  })
})
