import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TripEndpointControl, PlanView } from './plan-view'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import type { TransitStopInput } from '../../domain/transit/types'
import type { Journey } from '../../domain/trip/journey'
import type { VenueLocationMap } from '../../domain/venue/types'

const venues: VenueLocationMap = {
  'COM1-0210': {
    roomName: 'Computing 1, Level 2',
    location: { x: 103.77, y: 1.3 },
  },
}

const stops: TransitStopInput[] = [
  {
    id: 'STOP-A',
    longName: 'Central Library',
    shortName: 'Library',
    latitude: 1.3,
    longitude: 103.77,
    services: ['A1'],
  },
]

const transitNetwork = createValidTransitNetwork()
transitNetwork.stops = [stops[0], transitNetwork.stops[1]]
const networkIndex = createTransitIndex(transitNetwork)

describe('TripEndpointControl', () => {
  it('shows the selected endpoint and a stable ID for a destination', () => {
    const markup = renderToStaticMarkup(
      <TripEndpointControl
        role="destination"
        endpoint={{ kind: 'stop', id: 'STOP-A' }}
        venues={venues}
        networkIndex={networkIndex}
        searchQuery=""
        onSearchQueryChange={() => undefined}
        onSelect={() => undefined}
        onClear={vi.fn()}
      />,
    )

    expect(markup).toContain('Destination')
    expect(markup).toContain('STOP-A')
    expect(markup).toContain('aria-label="Clear destination"')
    expect(markup).toContain('id="trip-destination-search"')
  })

  it('uses the shared location search model and shows stable venue and stop IDs', () => {
    const venueMarkup = renderToStaticMarkup(
      <TripEndpointControl
        role="origin"
        endpoint={null}
        venues={venues}
        networkIndex={networkIndex}
        searchQuery="COM1"
        onSearchQueryChange={() => undefined}
        onSelect={() => undefined}
        onClear={() => undefined}
      />,
    )
    const stopMarkup = renderToStaticMarkup(
      <TripEndpointControl
        role="origin"
        endpoint={null}
        venues={venues}
        networkIndex={networkIndex}
        searchQuery="STOP-A"
        onSearchQueryChange={() => undefined}
        onSelect={() => undefined}
        onClear={() => undefined}
      />,
    )

    expect(venueMarkup).toContain('COM1-0210')
    expect(stopMarkup).toContain('STOP-A')
    expect(venueMarkup).toContain('Origin search results')
  })

  it('announces that location data is still loading when search data is unavailable', () => {
    const markup = renderToStaticMarkup(
      <TripEndpointControl
        role="origin"
        endpoint={null}
        venues={null}
        networkIndex={null}
        searchQuery="COM1"
        onSearchQueryChange={() => undefined}
        onSelect={() => undefined}
        onClear={() => undefined}
      />,
    )

    expect(markup).toContain('Origin search is waiting for location data to load.')
  })

  it('searches stops and resolves a stop label when venue data is unavailable', () => {
    const markup = renderToStaticMarkup(
      <TripEndpointControl
        role="origin"
        endpoint={{ kind: 'stop', id: 'STOP-A' }}
        venues={null}
        networkIndex={networkIndex}
        searchQuery="STOP-A"
        onSearchQueryChange={() => undefined}
        onSelect={() => undefined}
        onClear={() => undefined}
      />,
    )

    expect(markup).toContain('Central Library')
    expect(markup).toContain('STOP-A')
    expect(markup).toContain('Origin search results')
    expect(markup).not.toContain('waiting for location data')
  })
})

describe('TripEndpointControls Journey result', () => {
  it('shows the selected Journey inside the existing Plan trip experience', () => {
    const journey: Journey = {
      origin: { kind: 'venue', id: 'COM1-0210' },
      destination: { kind: 'stop', id: 'STOP-A' },
      legs: [{
        mode: 'walking',
        from: { kind: 'venue', id: 'COM1-0210' },
        to: { kind: 'stop', id: 'STOP-A' },
        durationSeconds: 60,
        distanceMeters: 100,
        geometry: { type: 'LineString', coordinates: [[103.77, 1.3], [103.771, 1.301]] },
      }],
      totalDurationSeconds: 60,
      totalDistanceMeters: 100,
      estimateStatus: 'estimated',
      planningQuality: 'exact',
    }

    const markup = renderToStaticMarkup(
      <PlanView
        tripRequest={{
          origin: { kind: 'venue', id: 'COM1-0210' },
          destination: { kind: 'stop', id: 'STOP-A' },
        }}
        venues={venues}
        networkIndex={networkIndex}
        journey={{ status: 'ready', journey, error: null }}
        onSwap={() => undefined}
        onSelectOriginEndpoint={() => undefined}
        onClearOriginEndpoint={() => undefined}
        onSelectDestinationEndpoint={() => undefined}
        onClearDestinationEndpoint={() => undefined}
        onClearTrip={() => undefined}
        onPlanJourney={() => undefined}
      />,
    )

    expect(markup).toContain('Recommended estimated Journey')
    expect(markup).toContain('Walk')
  })
})
