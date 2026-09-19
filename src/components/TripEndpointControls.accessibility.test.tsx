// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
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
  it('supports keyboard-search selection, swap, clear, and native endpoint semantics', async () => {
    const user = userEvent.setup()
    render(<TripEndpointHarness />)

    const originSearch = screen.getByRole('searchbox', { name: 'Origin' })
    await user.type(originSearch, 'COM1')
    await user.click(screen.getByRole('option', { name: 'Set origin to COM1-0210' }))
    expect(screen.getByText('Computing 1, Level 2')).toBeTruthy()

    const destinationSearch = screen.getByRole('searchbox', { name: 'Destination' })
    await user.type(destinationSearch, 'STOP-A')
    await user.click(screen.getByRole('option', { name: 'Set destination to STOP-A' }))
    expect(screen.getByText('Stop A')).toBeTruthy()

    const swap = screen.getByRole('button', { name: 'Swap origin and destination' })
    expect((swap as HTMLButtonElement).disabled).toBe(false)
    await user.click(swap)
    expect(screen.getByText('Computing 1, Level 2')).toBeTruthy()
    expect(screen.getByText('Stop A')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Clear both endpoints' }))
    expect(screen.getByText('No origin selected')).toBeTruthy()
    expect(screen.getByText('No destination selected')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Trip endpoints' })).toBeTruthy()
  })
})
