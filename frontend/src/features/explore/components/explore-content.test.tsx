import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExploreContent } from './explore-content'
import { createInitialExploreState } from '../state/explore-state'
import { createTransitIndex } from '../../../domain/transit'
import { createValidTransitNetwork } from '../../../domain/transit/test-fixtures'
import type { VenueLocationMap } from '@navus/shared/venue/types'

const transitIndex = createTransitIndex(createValidTransitNetwork())

const venues: VenueLocationMap = {
  'COM1-0210': {
    roomName: 'Computing 1, Level 2',
    floor: 2,
    location: { x: 103.77, y: 1.3 },
  },
}

function renderPanel(
  state = createInitialExploreState(),
  venueData: VenueLocationMap | null = venues,
  mobileSheet = true,
) {
  return renderToStaticMarkup(
    <ExploreContent
      state={state}
      mobileSheet={mobileSheet}
      venues={venueData}
      transitIndex={transitIndex}
      selectedRouteId="A1"
      onRouteSelect={() => undefined}
      onQueryChange={() => undefined}
      onVenueSelect={() => undefined}
      onOpenBusRoutes={() => undefined}
      onBack={() => undefined}
      onEscape={() => undefined}
    />,
  )
}

describe('ExploreContent', () => {
  it('starts on the mobile Find venue segment', () => {
    const markup = renderPanel()

    expect(markup).toContain('Find venue</button>')
    expect(markup).toContain('>Bus routes</button>')
    expect(markup).toContain('id="explore-venue-search-input"')
    expect(markup).not.toContain('Browse bus routes')
  })

  it('uses the shared Explore segments on desktop', () => {
    const markup = renderPanel(createInitialExploreState(), venues, false)

    expect(markup).toContain('explore-mode-selector')
    expect(markup).toContain('Find venue</button>')
    expect(markup).toContain('>Bus routes</button>')
    expect(markup).not.toContain('Explore NUS')
  })

  it('shows venue search without a route shortcut', () => {
    const markup = renderPanel({ ...createInitialExploreState(), mode: 'venue-search' })

    expect(markup).toContain('id="explore-venue-search-input"')
    expect(markup).toContain('>Find a venue</h2>')
    expect(markup).toContain('aria-labelledby="explore-content-heading"')
    expect(markup).toContain('Search for a venue')
    expect(markup).toContain('>Bus routes</button>')
    expect(markup).not.toContain('ghost-back-button')
    expect(markup).not.toContain('Search by venue code or room name.')
  })

  it('shows venue details without rendering a map popup', () => {
    const state = {
      ...createInitialExploreState(),
      mode: 'venue-detail' as const,
      selectedVenue: {
        code: 'COM1-0210',
        venue: venues['COM1-0210'],
      },
    }
    const markup = renderPanel(state)

    expect(markup).toContain('id="explore-venue-detail-heading"')
    expect(markup).toContain('>COM1-0210</h3>')
    expect(markup).toContain('<p class="venue-detail-name">Computing 1, Level 2</p>')
    expect(markup).toContain('Floor 2 · Computing 1')
    expect(markup).not.toContain('venue-detail-coordinates')
    expect(markup).not.toContain('1.300000, 103.770000')
    expect(markup).toContain('Navigate')
    expect(markup).toContain('<span>View in</span>')
    expect(markup).toMatch(/<img src="[^"]*nusmods-logo\.svg" alt="NUSMods"\/>/)
    expect(markup).toContain('Find venue</span></button>')
    expect(markup).not.toContain('Browse bus routes')
    expect(markup).not.toContain('>Back</button>')
    expect(markup).not.toContain('maplibregl-popup')
  })

  it('labels the detail return control from its previous context', () => {
    const state = {
      ...createInitialExploreState(),
      mode: 'venue-detail' as const,
      selectedVenue: {
        code: 'COM1-0210',
        venue: venues['COM1-0210'],
      },
      history: [{ mode: 'bus-routes' as const, query: '', selectedVenue: null }],
    }

    const markup = renderPanel(state)

    expect(markup).toContain('Bus routes</span></button>')
    expect(markup).toContain('class="button ghost-back-button"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).not.toContain('M19 12H5m7-7-7 7 7 7')
    expect(markup).not.toContain('←')
  })

  it('uses shared venue detail navigation actions', () => {
    const state = {
      ...createInitialExploreState(),
      mode: 'venue-detail' as const,
      selectedVenue: {
        code: 'COM1-0210',
        venue: venues['COM1-0210'],
      },
    }
    const markup = renderPanel(state, venues, false)

    expect(markup).toContain('class="button ghost-back-button"')
    expect(markup).not.toContain('Close map context')
    expect(markup).toContain('Navigate')
    expect(markup).toContain('<span>View in</span>')
    expect(markup).toMatch(/<img src="[^"]*nusmods-logo\.svg" alt="NUSMods"\/>/)
    expect(markup).not.toContain('Browse bus routes')
  })

  it('keeps Bus routes available when venue data fails', () => {
    const state = { ...createInitialExploreState(), mode: 'bus-routes' as const }
    const markup = renderPanel(state, null)

    expect(markup).toContain('Bus routes')
    expect(markup).toContain('bus route')
  })

  it('leaves bus route announcements to the route control', () => {
    const state = { ...createInitialExploreState(), mode: 'bus-routes' as const }
    const markup = renderPanel(state)

    expect(markup).not.toContain('bus routes opened.')
    expect(markup).toContain('Route A1 selected. 2 stops in route order.')
  })

  it('keeps the panel available when venue search throws', () => {
    const malformedVenues = { broken: null } as unknown as typeof venues
    const state = { ...createInitialExploreState(), mode: 'venue-search' as const, query: 'broken' }

    expect(() => renderPanel(state, malformedVenues)).not.toThrow()
    expect(renderPanel(state, malformedVenues)).toContain(
      'Venue search is unavailable right now. Bus route browsing is still available.',
    )
  })
})
