import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createTransitIndex } from '../../domain/transit'
import { createValidTransitNetwork } from '../../domain/transit/test-fixtures'
import type { TransitNetworkInput } from '../../domain/transit/types'
import type { VenueLocation, VenueLocationMap } from '../../domain/venue/types'
import { contextualPanelReducer, createInitialContextualPanelState } from './state'
import { ContextualPanel } from './contextual-panel'

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
  const searchState = contextualPanelReducer(createInitialContextualPanelState(), {
    type: 'open-venue-search',
  })
  return contextualPanelReducer(searchState, {
    type: 'select-venue',
    result: { code, venue: selectedVenue },
  })
}

function renderVenueDetails({
  code = 'COM1-0212',
  selectedVenue = venue,
  venues = { [code]: selectedVenue },
  transitIndex = createNearbyTransitIndex(),
  mobileViewport = true,
}: {
  code?: string
  selectedVenue?: VenueLocation
  venues?: VenueLocationMap
  transitIndex?: ReturnType<typeof createNearbyTransitIndex> | null
  mobileViewport?: boolean
} = {}): string {
  return renderToStaticMarkup(
    <ContextualPanel
      state={createVenueDetailState(code, selectedVenue)}
      venues={venues}
      transitIndex={transitIndex}
      shuttleRoutesAvailable
      renderShuttleRoutes={() => null}
      mobileViewport={mobileViewport}
      onQueryChange={() => undefined}
      onVenueSelect={() => undefined}
      onOpenVenueSearch={() => undefined}
      onOpenShuttle={() => undefined}
      onNavigateToVenue={() => undefined}
      onFocusStop={() => undefined}
      onBack={() => undefined}
      onClose={() => undefined}
      onEscape={() => undefined}
    />,
  )
}

describe('ContextualPanel venue details', () => {
  it('shows code-first venue identity, building, actions, and nearby stops in order', () => {
    const markup = renderVenueDetails()

    expect(markup).toContain('<h3 id="contextual-venue-detail-heading"')
    expect(markup).toMatch(/<h2 id="contextual-panel-heading"[^>]*class="visually-hidden">Venue details<\/h2>/)
    expect(markup).toContain('>COM1-0212</h3>')
    expect(markup).toContain('<p class="venue-detail-name">Seminar Room 3</p>')
    expect(markup).not.toContain('(COM1-0212)')
    expect(markup).toContain('venue-detail-building-icon')
    expect(markup).toContain('<span>Floor 2 · Computing 1</span></p>')
    expect(markup).not.toContain('venue-detail-coordinates')
    expect(markup).not.toContain('venue-detail-pin-icon')
    expect(markup).not.toContain('1.300000, 103.770000')
    expect(markup.indexOf('contextual-venue-detail-heading'))
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
    expect(markup).toContain('<img src="/nusmods-logo.svg" alt="NUSMods"/>')
  })

  it('renders nearby buttons with internal route badges and excludes public services', () => {
    const markup = renderVenueDetails()

    expect(markup).toContain('aria-label="Nearby stop Central Library Bus Stop, code STOP-A, services A1. View stop details"')
    expect(markup).toContain('data-stop-id="STOP-A"')
    expect(markup).toContain('data-service-id="A1"')
    expect(markup).toContain('background-color:#123456;color:#ffffff')
    expect(markup).toContain('background-color:#fbbf24;color:#000000')
    expect(markup).not.toContain('PUB:95')
    expect(markup).not.toContain('Public Bus Only')
  })

  it('shows an empty state when no shuttle stops qualify', () => {
    const markup = renderVenueDetails({ transitIndex: createTransitIndex(createValidTransitNetwork()) })

    expect(markup).toContain('No NUS shuttle stops within 500 m.')
  })

  it('uses the same naturally sized detail actions on desktop', () => {
    const markup = renderVenueDetails({ mobileViewport: false })

    expect(markup).toContain('class="venue-detail-actions"')
    expect(markup).toContain('<span>Navigate</span>')
    expect(markup).toContain('<span>View in</span>')
    expect(markup).toContain('<img src="/nusmods-logo.svg" alt="NUSMods"/>')
    expect(markup).toContain('Nearby bus stops')
    expect(markup).not.toContain('Browse shuttle routes')
  })
})
