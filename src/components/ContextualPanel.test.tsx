import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContextualPanel } from './ContextualPanel'
import { createInitialContextualPanelState } from '../contextual-panel/state'
import { createValidTransitNetwork } from '../domain/transit/test-fixtures'
import type { VenueLocationMap } from '../domain/venue/types'

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
      network={createValidTransitNetwork()}
      selectedRouteId={null}
      onQueryChange={() => undefined}
      onVenueSelect={() => undefined}
      onOpenVenueSearch={() => undefined}
      onOpenShuttle={() => undefined}
      onBack={() => undefined}
      onClose={() => undefined}
      onEscape={() => undefined}
      onRouteSelect={() => undefined}
    />,
  )
}

describe('ContextualPanel', () => {
  it('starts with venue search and a shuttle browsing action', () => {
    const markup = renderPanel()

    expect(markup).toContain('id="contextual-venue-search-input"')
    expect(markup).toContain('Browse shuttle routes')
    expect(markup).toContain('Search by venue code or room name.')
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

    expect(markup).toContain('<h3>COM1-0210</h3>')
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

  it('keeps the panel available when venue search throws', () => {
    const malformedVenues = { broken: null } as unknown as typeof venues
    const state = { ...createInitialContextualPanelState(), query: 'broken' }

    expect(() => renderPanel(state, malformedVenues)).not.toThrow()
    expect(renderPanel(state, malformedVenues)).toContain(
      'Venue search is unavailable right now. Shuttle browsing is still available.',
    )
  })
})
