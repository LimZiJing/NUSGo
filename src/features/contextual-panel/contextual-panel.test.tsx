import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContextualPanel } from './contextual-panel'
import { createInitialContextualPanelState } from './state'
import type { VenueLocationMap } from '../../domain/venue/types'

const venues: VenueLocationMap = {
  'COM1-0210': {
    roomName: 'Computing 1, Level 2',
    floor: 2,
    location: { x: 103.77, y: 1.3 },
  },
}

function renderPanel(
  state = createInitialContextualPanelState(),
  venueData: VenueLocationMap | null = venues,
  mobileViewport = true,
) {
  return renderToStaticMarkup(
    <ContextualPanel
      state={state}
      mobileViewport={mobileViewport}
      venues={venueData}
      shuttleRoutesAvailable
      renderShuttleRoutes={() => <span>Showing all 1 shuttle routes and all 2 shuttle stops.</span>}
      onQueryChange={() => undefined}
      onVenueSelect={() => undefined}
      onOpenShuttle={() => undefined}
      onBack={() => undefined}
      onClose={() => undefined}
      onEscape={() => undefined}
    />,
  )
}

describe('ContextualPanel', () => {
  it('starts on the mobile Find venue segment', () => {
    const markup = renderPanel()

    expect(markup).toContain('Find venue</button>')
    expect(markup).toContain('>Shuttle routes</button>')
    expect(markup).toContain('id="contextual-venue-search-input"')
    expect(markup).not.toContain('Browse shuttle routes')
  })

  it('uses the shared Explore segments on desktop', () => {
    const markup = renderPanel(createInitialContextualPanelState(), venues, false)

    expect(markup).toContain('mobile-explore-segments')
    expect(markup).toContain('Find venue</button>')
    expect(markup).toContain('>Shuttle routes</button>')
    expect(markup).not.toContain('Explore NUS')
  })

  it('shows venue search without a route shortcut', () => {
    const markup = renderPanel({ ...createInitialContextualPanelState(), mode: 'venue-search' })

    expect(markup).toContain('id="contextual-venue-search-input"')
    expect(markup).toContain('>Find a venue</h2>')
    expect(markup).toContain('aria-labelledby="contextual-panel-heading"')
    expect(markup).toContain('Search for a venue')
    expect(markup).toContain('>Shuttle routes</button>')
    expect(markup).not.toContain('mobile-ghost-back-button')
    expect(markup).not.toContain('Search by venue code or room name.')
  })

  it('shows venue details without rendering a map popup', () => {
    const state = {
      ...createInitialContextualPanelState(),
      mode: 'venue-detail' as const,
      selectedVenue: {
        code: 'COM1-0210',
        venue: venues['COM1-0210'],
      },
    }
    const markup = renderPanel(state)

    expect(markup).toContain('id="contextual-venue-detail-heading"')
    expect(markup).toContain('>COM1-0210</h3>')
    expect(markup).toContain('<p class="venue-detail-name">Computing 1, Level 2</p>')
    expect(markup).toContain('Floor 2 · Computing 1')
    expect(markup).not.toContain('venue-detail-coordinates')
    expect(markup).not.toContain('1.300000, 103.770000')
    expect(markup).toContain('Navigate')
    expect(markup).toContain('<span>View in</span>')
    expect(markup).toContain('<img src="/nusmods-logo.svg" alt="NUSMods"/>')
    expect(markup).toContain('Find venue</button>')
    expect(markup).not.toContain('Browse shuttle routes')
    expect(markup).not.toContain('>Back</button>')
    expect(markup).not.toContain('maplibregl-popup')
  })

  it('labels the mobile detail return control from its previous context', () => {
    const state = {
      ...createInitialContextualPanelState(),
      mode: 'venue-detail' as const,
      selectedVenue: {
        code: 'COM1-0210',
        venue: venues['COM1-0210'],
      },
      history: [{ mode: 'shuttle' as const, query: '', selectedVenue: null }],
    }

    const markup = renderPanel(state)

    expect(markup).toContain('Shuttle routes</button>')
    expect(markup).toContain('class="mobile-ghost-back-button"')
    expect(markup).toContain('<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">')
    expect(markup).toContain('M19 12H5m7-7-7 7 7 7')
    expect(markup).not.toContain('←')
  })

  it('keeps desktop venue detail navigation actions', () => {
    const state = {
      ...createInitialContextualPanelState(),
      mode: 'venue-detail' as const,
      selectedVenue: {
        code: 'COM1-0210',
        venue: venues['COM1-0210'],
      },
    }
    const markup = renderPanel(state, venues, false)

    expect(markup).toContain('aria-label="Back to venue search"')
    expect(markup).toContain('aria-label="Close map context"')
    expect(markup).toContain('Navigate')
    expect(markup).toContain('<span>View in</span>')
    expect(markup).toContain('<img src="/nusmods-logo.svg" alt="NUSMods"/>')
    expect(markup).not.toContain('Browse shuttle routes')
  })

  it('keeps shuttle mode available when venue data fails', () => {
    const state = { ...createInitialContextualPanelState(), mode: 'shuttle' as const }
    const markup = renderPanel(state, null)

    expect(markup).toContain('Shuttle routes')
    expect(markup).toContain('Shuttle route')
  })

  it('leaves shuttle route announcements to the route control', () => {
    const state = { ...createInitialContextualPanelState(), mode: 'shuttle' as const }
    const markup = renderPanel(state)

    expect(markup).not.toContain('Shuttle routes opened.')
    expect(markup).toContain('Showing all 1 shuttle routes and all 2 shuttle stops.')
  })

  it('keeps the panel available when venue search throws', () => {
    const malformedVenues = { broken: null } as unknown as typeof venues
    const state = { ...createInitialContextualPanelState(), mode: 'venue-search' as const, query: 'broken' }

    expect(() => renderPanel(state, malformedVenues)).not.toThrow()
    expect(renderPanel(state, malformedVenues)).toContain(
      'Venue search is unavailable right now. Shuttle browsing is still available.',
    )
  })
})
