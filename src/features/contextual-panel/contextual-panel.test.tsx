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
) {
  return renderToStaticMarkup(
    <ContextualPanel
      state={state}
      venues={venueData}
      shuttleRoutesAvailable
      renderShuttleRoutes={() => <span>Showing all 1 shuttle routes and all 2 shuttle stops.</span>}
      onQueryChange={() => undefined}
      onVenueSelect={() => undefined}
      onOpenVenueSearch={() => undefined}
      onOpenShuttle={() => undefined}
      onBack={() => undefined}
      onClose={() => undefined}
      onEscape={() => undefined}
    />,
  )
}

describe('ContextualPanel', () => {
  it('starts with a venue search view without a route shortcut', () => {
    const markup = renderPanel()

    expect(markup).toContain('id="contextual-venue-search-input"')
    expect(markup).toContain('>Find a venue</h2>')
    expect(markup).toContain('aria-labelledby="contextual-panel-heading"')
    expect(markup).toContain('Search for a venue')
    expect(markup).not.toContain('Browse shuttle routes')
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
    expect(markup).toContain('Computing 1, Level 2')
    expect(markup).toContain('<strong>Floor:</strong> 2')
    expect(markup).not.toContain('maplibregl-popup')
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
    const state = { ...createInitialContextualPanelState(), query: 'broken' }

    expect(() => renderPanel(state, malformedVenues)).not.toThrow()
    expect(renderPanel(state, malformedVenues)).toContain(
      'Venue search is unavailable right now. Shuttle browsing is still available.',
    )
  })
})
