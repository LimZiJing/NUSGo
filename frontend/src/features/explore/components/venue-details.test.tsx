import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createTransitIndex } from '../../../domain/transit'
import { createValidTransitNetwork } from '../../../domain/transit/test-fixtures'
import type { TransitNetworkInput } from '@navus/shared/transit/types'
import type { VenueLocation, VenueLocationMap } from '@navus/shared/venue/types'
import { exploreReducer, createInitialExploreState } from '../state/explore-state'
import { ExploreContentHarness as ExploreContent } from './explore-content-harness'
import { VenueDetails } from './venue-details'

const venue: VenueLocation = {
  roomName: 'Seminar Room 3',
  floor: 2,
  location: { x: 103.77, y: 1.3 },
}

function createNearbyTransitIndex() {
  const network: TransitNetworkInput = createValidTransitNetwork()
  network.routes = [
    { id: 'A1', name: 'A1', color: '#123456', stopIds: ['STOP-A'] },
    { id: 'B1', name: 'B1', color: '#fbbf24', stopIds: ['STOP-B'] },
  ]
  network.stops = [
    {
      id: 'STOP-A',
      longName: 'Central Library Bus Stop',
      shortName: 'Central Library',
      latitude: 1.3002,
      longitude: 103.77,
      services: ['A1', 'PUB:95'],
    },
    {
      id: 'STOP-B',
      longName: 'Yusof Ishak House Bus Stop',
      shortName: 'Yusof Ishak House',
      latitude: 1.3004,
      longitude: 103.77,
      services: ['B1', 'PUB:95'],
    },
    {
      id: 'PUBLIC-ONLY',
      longName: 'Public Bus Only',
      shortName: 'Public Bus Only',
      latitude: 1.3,
      longitude: 103.77,
      services: ['PUB:95'],
    },
  ]
  return createTransitIndex(network)
}

function createVenueDetailState(code: string, selectedVenue: VenueLocation) {
  return exploreReducer(createInitialExploreState(), {
    type: 'select-venue',
    result: { code, venue: selectedVenue },
  })
}

function renderVenueDetails({
  code = 'COM1-0212',
  selectedVenue = venue,
  venues = { [code]: selectedVenue },
  transitIndex = createNearbyTransitIndex(),
  mobileSheet = true,
}: {
  code?: string
  selectedVenue?: VenueLocation
  venues?: VenueLocationMap
  transitIndex?: ReturnType<typeof createNearbyTransitIndex> | null
  mobileSheet?: boolean
} = {}): string {
  return renderToStaticMarkup(
    <ExploreContent
      state={createVenueDetailState(code, selectedVenue)}
      venues={venues}
      transitIndex={transitIndex}
      onRouteSelect={() => undefined}
      mobileSheet={mobileSheet}
      onQueryChange={() => undefined}
      onVenueSelect={() => undefined}
      onOpenBusRoutes={() => undefined}
      onNavigateToVenue={() => undefined}
      onFocusStop={() => undefined}
      onBack={() => undefined}
      onEscape={() => undefined}
    />,
  )
}

function renderMobileVenueDetails({
  code = 'COM1-0212',
  selectedVenue = venue,
  transitIndex = createNearbyTransitIndex(),
}: {
  code?: string
  selectedVenue?: VenueLocation
  transitIndex?: ReturnType<typeof createNearbyTransitIndex> | null
} = {}): string {
  return renderToStaticMarkup(
    <VenueDetails
      venue={{ code, venue: selectedVenue }}
      transitIndex={transitIndex}
      headingRef={createRef<HTMLHeadingElement>()}
      onNavigateToVenue={() => undefined}
      onFocusStop={() => undefined}
      mobileMapDetailOverlay
    />,
  )
}

describe('ExploreContent venue details', () => {
  it('shows code-first venue identity, building, actions, and nearby stops in order', () => {
    const markup = renderVenueDetails()

    expect(markup).toContain('Nearby bus stops within 500 m')
    expect(markup).toContain('<h3 id="explore-venue-detail-heading"')
    expect(markup).toContain('aria-label="COM1-0212, venue"')
    expect(markup).toContain('location-identity-icon--venue')
    expect(markup).toMatch(/<h2 id="explore-content-heading"[^>]*class="visually-hidden">Venue details<\/h2>/)
    expect(markup).toContain('>COM1-0212</h3>')
    expect(markup).toContain('<p class="venue-detail-name">Seminar Room 3</p>')
    expect(markup).not.toContain('(COM1-0212)')
    expect(markup).toContain('venue-detail-building-icon')
    expect(markup).toContain('<span>Floor 2 · Computing 1</span></p>')
    expect(markup).not.toContain('venue-detail-coordinates')
    expect(markup).not.toContain('venue-detail-pin-icon')
    expect(markup).not.toContain('1.300000, 103.770000')
    expect(markup.indexOf('explore-venue-detail-heading'))
      .toBeLessThan(markup.indexOf('venue-detail-name'))
    expect(markup.indexOf('venue-detail-name'))
      .toBeLessThan(markup.indexOf('venue-detail-location'))
    expect(markup.indexOf('venue-detail-location'))
      .toBeLessThan(markup.indexOf('venue-detail-actions'))
    expect(markup.indexOf('venue-detail-actions'))
      .toBeLessThan(markup.indexOf('Nearby bus stops'))
  })

  it('omits nearby stops and disables navigation for a venue without coordinates', () => {
    const unlocatedVenue: VenueLocation = { roomName: 'Tutorial Room' }
    const markup = renderVenueDetails({
      code: 'AS7-0214',
      selectedVenue: unlocatedVenue,
      venues: { 'AS7-0214': unlocatedVenue },
    })

    expect(markup).toContain('<span>The Shaw Foundation Building</span></p>')
    expect(markup).not.toContain('venue-detail-coordinates')
    expect(markup).not.toContain('Nearby bus stops')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('href="https://nusmods.com/venues/AS7-0214"')
  })

  it('omits the floor and building line when neither is confirmed', () => {
    const unknownVenue: VenueLocation = {
      roomName: 'Unknown room',
      floor: null,
      location: { x: 103.77, y: 1.3 },
    }
    const markup = renderVenueDetails({
      code: 'UNKNOWN-0101',
      selectedVenue: unknownVenue,
      venues: { 'UNKNOWN-0101': unknownVenue },
    })

    expect(markup).not.toContain('venue-detail-location')
  })

  it('links to NUSMods with its local logo', () => {
    const markup = renderVenueDetails()

    expect(markup).toContain('href="https://nusmods.com/venues/COM1-0212"')
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noreferrer"')
    expect(markup).toContain('<span>View in</span>')
    expect(markup).toMatch(/<img src="[^"]*nusmods-logo\.svg" alt="NUSMods"\/>/)
  })

  it('places mobile Navigate in the header and NUSMods beside the nearby stops heading', () => {
    const markup = renderMobileVenueDetails()
    const headerStart = markup.indexOf('<header class="mobile-detail-header">')
    const headerEnd = markup.indexOf('</header>', headerStart)
    const bottomHeadingStart = markup.indexOf('<div class="mobile-detail-bottom-heading">')
    const bottomHeadingEnd = markup.indexOf('</div>', bottomHeadingStart)
    const header = markup.slice(headerStart, headerEnd)
    const bottomHeading = markup.slice(bottomHeadingStart, bottomHeadingEnd)

    expect(header).toContain('aria-label="Navigate to this venue"')
    expect(header).not.toContain('nusmods-logo.svg')
    expect(bottomHeading).toContain('Nearby bus stops · 500 m')
    expect(bottomHeading).toContain('href="https://nusmods.com/venues/COM1-0212"')
  })

  it('keeps NUSMods in the bottom action position when a mobile venue has no coordinates', () => {
    const unlocatedVenue: VenueLocation = { roomName: 'Tutorial Room' }
    const markup = renderMobileVenueDetails({
      code: 'AS7-0214',
      selectedVenue: unlocatedVenue,
    })
    const headerStart = markup.indexOf('<header class="mobile-detail-header">')
    const headerEnd = markup.indexOf('</header>', headerStart)
    const bottomHeadingStart = markup.indexOf('<div class="mobile-detail-bottom-heading">')
    const bottomHeadingEnd = markup.indexOf('</div>', bottomHeadingStart)

    expect(markup).not.toContain('Nearby bus stops')
    expect(markup.slice(headerStart, headerEnd)).toContain('aria-label="Navigate to this venue"')
    expect(markup.slice(headerStart, headerEnd)).not.toContain('nusmods-logo.svg')
    expect(markup.slice(bottomHeadingStart, bottomHeadingEnd))
      .toContain('href="https://nusmods.com/venues/AS7-0214"')
  })

  it('renders nearby buttons with internal route badges and excludes public services', () => {
    const markup = renderVenueDetails()

    expect(markup).toContain('aria-label="Nearby bus stop Central Library Bus Stop, code STOP-A, services A1. View stop details"')
    expect(markup).toContain('location-identity-icon--stop')
    expect(markup).toContain('data-stop-id="STOP-A"')
    expect(markup).toContain('data-service-id="A1"')
    expect(markup).toContain('background-color:#123456;color:#ffffff')
    expect(markup).toContain('background-color:#fbbf24;color:#000000')
    expect(markup).not.toContain('PUB:95')
    expect(markup).not.toContain('Public Bus Only')
  })

  it('shows an empty state when no bus stops qualify', () => {
    const markup = renderVenueDetails({ transitIndex: createTransitIndex(createValidTransitNetwork()) })

    expect(markup).toContain('No NUS bus stops within 500 m.')
  })

  it('uses the same naturally sized detail actions on desktop', () => {
    const markup = renderVenueDetails({ mobileSheet: false })

    expect(markup).toContain('class="venue-detail-actions"')
    expect(markup).toContain('<span>Navigate</span>')
    expect(markup).toContain('<span>View in</span>')
    expect(markup).toMatch(/<img src="[^"]*nusmods-logo\.svg" alt="NUSMods"\/>/)
    expect(markup).toContain('Nearby bus stops')
    expect(markup).not.toContain('Browse bus routes')
  })
})
