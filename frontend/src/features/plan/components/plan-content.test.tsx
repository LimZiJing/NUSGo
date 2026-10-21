// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanContentHarness as PlanContent } from './plan-content-harness'
import { PlanLocationSearch } from './plan-location-search'
import { buildBuildingIndex } from '../../../domain/venue/building-index'
import { createTransitIndex } from '../../../domain/transit'
import { createValidTransitNetwork } from '../../../domain/transit/test-fixtures'
import {
  clearTripEndpoint,
  createEmptyTripRequest,
  setTripEndpoint,
  swapTripEndpoints,
} from '../../../domain/trip/endpoints'
import type { TripRequest } from '../../../domain/trip/types'
import type { TransitStopInput } from '@navus/shared/transit/types'
import type { Path, ScoredPathCandidate } from '@navus/shared/routing/path'
import type { VenueLocationMap } from '@navus/shared/venue/types'

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
const buildings = buildBuildingIndex([{
  id: 'central-library',
  name: 'Central Library',
  aliases: [],
  elementId: 'way/2',
  location: { x: 103.773, y: 1.2966 },
  roomCodePrefixes: [],
  sourceRefs: [],
}])

const noopControls = {
  onSwap: () => undefined,
  onSelectOriginEndpoint: () => undefined,
  onClearOriginEndpoint: () => undefined,
  onSelectDestinationEndpoint: () => undefined,
  onClearDestinationEndpoint: () => undefined,
  onClearTrip: () => undefined,
  onPlanJourney: () => undefined,
}

function TripHarness({
  onPlanJourney = () => undefined,
  onSearchResult,
}: {
  onPlanJourney?: () => void
  onSearchResult?: () => void
}) {
  const [tripRequest, setTripRequest] = useState<TripRequest>(createEmptyTripRequest())

  return (
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
      onPlanJourney={onPlanJourney}
      onSearchResult={onSearchResult}
    />
  )
}

function renderSearch(props: Partial<Parameters<typeof PlanLocationSearch>[0]> = {}): string {
  return renderToStaticMarkup(
    <PlanLocationSearch
      role="origin"
      venues={venues}
      networkIndex={networkIndex}
      searchQuery=""
      otherEndpointLabel={null}
      onSearchQueryChange={() => undefined}
      onSelect={() => undefined}
      onBack={() => undefined}
      {...props}
    />,
  )
}

afterEach(cleanup)

describe('PlanLocationSearch results', () => {
  it('lists a building by name with an accessible building label, apart from the stop of the same name', () => {
    const markup = renderSearch({ buildings, searchQuery: 'Library' })

    expect(markup).toContain('aria-label="Set origin to Central Library, building"')
    expect(markup).toContain('aria-label="Set origin to Central Library, bus stop, STOP-A"')
    expect(markup).not.toContain('>central-library<')
  })

  it('shows stable venue and stop IDs from the shared location search', () => {
    expect(renderSearch({ searchQuery: 'COM1' })).toContain('COM1-0210')
    expect(renderSearch({ searchQuery: 'STOP-A' })).toContain('STOP-A')
    expect(renderSearch({ searchQuery: 'COM1' })).toContain('Origin search results')
  })

  it('does not repeat a stop code when the short name matches the ID', () => {
    const codeNetwork = createValidTransitNetwork()
    codeNetwork.stops = [{ ...stops[0], shortName: 'stop-a' }, codeNetwork.stops[1]]
    const markup = renderSearch({
      venues: null,
      networkIndex: createTransitIndex(codeNetwork),
      searchQuery: 'Central Library',
    })

    expect(markup).not.toContain('stop-a (STOP-A)')
    expect(markup).not.toContain('>stop-a<')
  })

  it('announces that location data is still loading when search data is unavailable', () => {
    const markup = renderSearch({ venues: null, networkIndex: null, searchQuery: 'COM1' })

    expect(markup).toContain('Origin search is waiting for location data to load.')
  })

  it('groups results under headings only when several kinds match', () => {
    const grouped = renderSearch({ buildings, searchQuery: 'Library' })
    expect(grouped).toContain('>Buildings<')
    expect(grouped).toContain('>Bus stops<')

    const single = renderSearch({ searchQuery: 'COM1' })
    expect(single).not.toContain('plan-search-heading')
  })

  it('shows the suggestions before anything is typed', () => {
    const markup = renderSearch({
      suggestions: [{
        endpoint: { kind: 'stop', id: 'STOP-A' },
        label: 'Central Library',
        detail: '',
      }],
    })

    expect(markup).toContain('aria-label="Set origin to Central Library, bus stop, STOP-A"')
  })
})

describe('PlanContent trip card', () => {
  it('shows an empty trip as prompts, with no header or trip menu', () => {
    render(<TripHarness />)

    expect(screen.getByRole('button', { name: 'Choose origin' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose destination' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Trip actions' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Plan trip' }).className).toContain('visually-hidden')
  })

  it('shows both ends by name and enables swap only when both are set', () => {
    const { rerender } = render(
      <PlanContent
        {...noopControls}
        venues={venues}
        networkIndex={networkIndex}
        tripRequest={{ origin: { kind: 'venue', id: 'COM1-0210' }, destination: null }}
      />,
    )
    expect((screen.getByRole('button', { name: 'Swap origin and destination' }) as HTMLButtonElement).disabled).toBe(true)

    rerender(
      <PlanContent
        {...noopControls}
        venues={venues}
        networkIndex={networkIndex}
        tripRequest={{
          origin: { kind: 'venue', id: 'COM1-0210' },
          destination: { kind: 'stop', id: 'STOP-A' },
        }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Origin: Computing 1, Level 2. Change origin' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Destination: Central Library. Change destination' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Swap origin and destination' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows endpoint validation only after Get route is pressed, then clears it once filled', async () => {
    const user = userEvent.setup()
    const onPlanJourney = vi.fn()
    const controls = { ...noopControls, venues, networkIndex, onPlanJourney }

    const { rerender } = render(
      <PlanContent {...controls} tripRequest={{ origin: null, destination: null }} />,
    )
    expect(screen.queryByText('Origin is required.')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Get route' }))
    expect(onPlanJourney).not.toHaveBeenCalled()
    const validation = screen.getByText('Origin is required.')
    expect(validation.getAttribute('role')).toBe('status')
    expect(validation.getAttribute('aria-live')).toBe('polite')

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

  it('uses Get route as the explicit planning action and disables it while planning', async () => {
    const user = userEvent.setup()
    const onPlanJourney = vi.fn()
    const controls = {
      ...noopControls,
      venues,
      networkIndex,
      tripRequest: {
        origin: { kind: 'venue' as const, id: 'COM1-0210' },
        destination: { kind: 'stop' as const, id: 'STOP-A' },
      },
      onPlanJourney,
    }

    const { rerender } = render(<PlanContent {...controls} />)
    const submit = screen.getByRole('button', { name: 'Get route' })
    expect((submit as HTMLButtonElement).disabled).toBe(false)
    await user.click(submit)
    expect(onPlanJourney).toHaveBeenCalledOnce()

    rerender(<PlanContent {...controls} path={{ status: 'loading', path: null, candidates: [], error: null }} />)
    expect((screen.getByRole('button', { name: 'Get route' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers a retryable current-location action for the origin', async () => {
    const user = userEvent.setup()
    const onUseCurrentLocationForOrigin = vi.fn()
    const controls = {
      ...noopControls,
      venues,
      networkIndex,
      tripRequest: { origin: null, destination: null },
      onUseCurrentLocationForOrigin,
    }

    const { rerender } = render(<PlanContent {...controls} />)
    await user.click(screen.getByRole('button', { name: 'Use current location' }))
    expect(onUseCurrentLocationForOrigin).toHaveBeenCalledOnce()

    rerender(<PlanContent {...controls} originLocationRequest={{ status: 'requesting', error: null }} />)
    expect((screen.getByRole('button', { name: 'Getting current location' }) as HTMLButtonElement).disabled).toBe(true)

    rerender(<PlanContent
      {...controls}
      originLocationRequest={{ status: 'error', error: 'Device location is unavailable. Please try again.' }}
    />)
    expect(screen.getByText('Device location is unavailable. Please try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry current location' })).toBeTruthy()

    rerender(<PlanContent
      {...controls}
      tripRequest={{
        origin: { kind: 'current-location', coordinate: { longitude: 103.12345, latitude: 1.23456 } },
        destination: null,
      }}
    />)
    expect(screen.getByRole('button', { name: 'Origin: Current location. Change origin' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use current location' })).toBeNull()
  })
})

describe('PlanContent location search', () => {
  it('opens the shared search from either line and reports the sheet callbacks', async () => {
    const user = userEvent.setup()
    const onSearchFocus = vi.fn()
    const onSearchCancel = vi.fn()
    render(
      <PlanContent
        {...noopControls}
        venues={venues}
        networkIndex={networkIndex}
        tripRequest={createEmptyTripRequest()}
        onSearchFocus={onSearchFocus}
        onSearchCancel={onSearchCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Choose destination' }))
    const search = screen.getByRole('searchbox', { name: 'Destination' })
    expect(document.activeElement).toBe(search)
    expect(onSearchFocus).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Get route' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Back from destination search' }))
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(onSearchCancel).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Choose destination' })).toBeTruthy()
  })

  it('runs the full origin flow: search, pick, return to the card, and end the mobile search', async () => {
    const user = userEvent.setup()
    const onSearchResult = vi.fn()
    render(<TripHarness onSearchResult={onSearchResult} />)

    await user.click(screen.getByRole('button', { name: 'Choose origin' }))
    await user.type(screen.getByRole('searchbox', { name: 'Origin' }), 'COM1')
    const results = screen.getByRole('group', { name: 'Origin search results' })
    await user.click(within(results).getByRole('button', { name: 'Set origin to COM1-0210, venue' }))

    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(onSearchResult).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Origin: Computing 1, Level 2. Change origin' })).toBeTruthy()
  })

  it('keeps the other end visible as context while searching', async () => {
    const user = userEvent.setup()
    render(
      <PlanContent
        {...noopControls}
        venues={venues}
        networkIndex={networkIndex}
        tripRequest={{ origin: null, destination: { kind: 'stop', id: 'STOP-A' } }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Choose origin' }))
    expect(screen.getByText('To: Central Library')).toBeTruthy()
  })

  it('uses Escape to clear the query first, then leave the search', async () => {
    const user = userEvent.setup()
    render(<TripHarness />)

    await user.click(screen.getByRole('button', { name: 'Choose origin' }))
    const search = screen.getByRole('searchbox', { name: 'Origin' })
    await user.type(search, 'COM1')
    expect(screen.getByRole('button', { name: /COM1-0210/ })).toBeTruthy()

    await user.keyboard('{Escape}')
    expect((search as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: /COM1-0210/ })).toBeNull()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('narrows results with the type chips and explains an empty result', async () => {
    const user = userEvent.setup()
    render(
      <PlanContent
        {...noopControls}
        venues={venues}
        buildings={buildings}
        networkIndex={networkIndex}
        tripRequest={createEmptyTripRequest()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Choose destination' }))
    await user.type(screen.getByRole('searchbox', { name: 'Destination' }), 'Library')
    expect(screen.getByRole('button', { name: 'Set destination to Central Library, building' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Set destination to Central Library, bus stop, STOP-A' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    expect(screen.getByRole('button', { name: 'Rooms' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: /Central Library/ })).toBeNull()
    expect(screen.getByText('No matches for “Library”')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Buildings' }))
    expect(screen.getByRole('button', { name: 'Set destination to Central Library, building' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /bus stop/ })).toBeNull()
  })

  it('clears the typed search with its inline X control', async () => {
    const user = userEvent.setup()
    render(<TripHarness />)

    await user.click(screen.getByRole('button', { name: 'Choose destination' }))
    await user.type(screen.getByRole('searchbox', { name: 'Destination' }), 'STOP')
    await user.click(screen.getByRole('button', { name: 'Clear destination search' }))

    expect((screen.getByRole('searchbox', { name: 'Destination' }) as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Clear destination search' })).toBeNull()
  })

  it('offers current location from the origin search bar only', async () => {
    const user = userEvent.setup()
    const onUseCurrentLocationForOrigin = vi.fn()
    render(
      <PlanContent
        {...noopControls}
        venues={venues}
        networkIndex={networkIndex}
        tripRequest={createEmptyTripRequest()}
        onUseCurrentLocationForOrigin={onUseCurrentLocationForOrigin}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Choose origin' }))
    await user.click(screen.getByRole('button', { name: 'Use current location' }))
    expect(onUseCurrentLocationForOrigin).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Back from origin search' }))
    await user.click(screen.getByRole('button', { name: 'Choose destination' }))
    expect(screen.queryByRole('button', { name: 'Use current location' })).toBeNull()
  })

  it('swaps the two ends from the card', async () => {
    const user = userEvent.setup()
    render(<TripHarness />)

    await user.click(screen.getByRole('button', { name: 'Choose origin' }))
    await user.type(screen.getByRole('searchbox', { name: 'Origin' }), 'COM1')
    await user.click(screen.getByRole('button', { name: 'Set origin to COM1-0210, venue' }))
    await user.click(screen.getByRole('button', { name: 'Choose destination' }))
    await user.type(screen.getByRole('searchbox', { name: 'Destination' }), 'STOP-A')
    await user.click(screen.getByRole('button', { name: 'Set destination to Central Library, bus stop, STOP-A' }))

    await user.click(screen.getByRole('button', { name: 'Swap origin and destination' }))
    expect(screen.getByRole('button', { name: 'Origin: Central Library. Change origin' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Destination: Computing 1, Level 2. Change destination' })).toBeTruthy()
  })
})

describe('Plan view Journey result', () => {
  it('shows the selected Journey inside the existing Plan trip experience', () => {
    const path: Path = {
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
    const candidate: ScoredPathCandidate = {
      candidateKey: 'walking:COM1-0210>STOP-A',
      path,
      adjustedDurationSeconds: 75,
      score: 1 / 75,
    }

    const markup = renderToStaticMarkup(
      <PlanContent
        {...noopControls}
        tripRequest={{
          origin: { kind: 'venue', id: 'COM1-0210' },
          destination: { kind: 'stop', id: 'STOP-A' },
        }}
        venues={venues}
        networkIndex={networkIndex}
        path={{ status: 'ready', path, candidates: [candidate], error: null }}
      />,
    )

    expect(markup).toContain('Recommended')
    expect(markup).not.toMatch(/\b\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}\b/)
    expect(markup).toContain('Walk')
  })
})
