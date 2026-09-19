import { useEffect, useMemo } from 'react'
import { searchVenues, type VenueSearchResult } from '../domain/venue/search'
import type { TransitNetwork } from '../domain/transit/types'
import type { VenueLocationMap } from '../domain/venue/types'
import type { ContextualPanelState } from '../contextual-panel/state'
import { TransitRouteControl } from './TransitRouteControl'

interface ContextualPanelProps {
  state: ContextualPanelState
  venues: VenueLocationMap | null
  network: TransitNetwork | null
  selectedRouteId: string | null
  onQueryChange: (query: string) => void
  onVenueSelect: (result: VenueSearchResult) => void
  onOpenVenueSearch: () => void
  onOpenShuttle: () => void
  onBack: () => void
  onClose: () => void
  onEscape: () => void
  onRouteSelect: (routeId: string | null) => void
}

function getPanelHeading(state: ContextualPanelState): string {
  if (state.mode === 'shuttle') return 'Shuttle routes'
  if (state.mode === 'venue-detail') return 'Venue details'
  return 'Explore NUS'
}

export function ContextualPanel({
  state,
  venues,
  network,
  selectedRouteId,
  onQueryChange,
  onVenueSelect,
  onOpenVenueSearch,
  onOpenShuttle,
  onBack,
  onClose,
  onEscape,
  onRouteSelect,
}: ContextualPanelProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onEscape()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onEscape])

  const searchState = useMemo(() => {
    if (!venues) return { results: [], failed: false }

    try {
      return { results: searchVenues(venues, state.query), failed: false }
    } catch (error) {
      // Venue data is independent from shuttle browsing, so a search failure must not
      // remove the panel or hide the route controls.
      console.error('Venue search failed:', error)
      return { results: [], failed: true }
    }
  }, [state.query, venues])

  return (
    <section
      className={`contextual-panel contextual-panel-${state.mode}`}
      aria-label="Map context"
    >
      <div className="contextual-panel-header">
        <h2>{getPanelHeading(state)}</h2>
        {state.mode !== 'neutral' && (
          <button type="button" onClick={onClose} aria-label="Close map context">
            Close
          </button>
        )}
      </div>

      {state.mode === 'neutral' && (
        <div className="contextual-panel-content">
          <p>Search for a venue or browse the shuttle network.</p>
          <div className="contextual-panel-actions">
            <button type="button" onClick={onOpenVenueSearch}>
              Find a venue
            </button>
            <button type="button" onClick={onOpenShuttle}>
              Browse shuttle routes
            </button>
          </div>
        </div>
      )}

      {state.mode === 'venue-search' && (
        <div className="contextual-panel-content">
          <label htmlFor="contextual-venue-search-input">Find a venue</label>
          <div className="contextual-panel-search-row">
            <input
              id="contextual-venue-search-input"
              type="search"
              placeholder="e.g. COM1-0210"
              value={state.query}
              onChange={(event) => onQueryChange(event.target.value)}
              autoComplete="off"
            />
            {state.query && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                aria-label="Clear venue search"
              >
                Clear
              </button>
            )}
          </div>
          {venues === null || searchState.failed ? (
            <p className="contextual-panel-status" role="status">
              Venue search is unavailable right now. Shuttle browsing is still available.
            </p>
          ) : state.query.trim() ? (
            <div className="contextual-panel-results" aria-label="Venue search results">
              {searchState.results.length > 0 ? (
                searchState.results.map((result) => (
                  <button
                    className="contextual-panel-result"
                    type="button"
                    key={result.code}
                    onClick={() => onVenueSelect(result)}
                  >
                    <strong>{result.code}</strong>
                    <span>{result.venue.roomName}</span>
                  </button>
                ))
              ) : (
                <p className="contextual-panel-status" role="status">No matching venues.</p>
              )}
            </div>
          ) : (
            <p className="contextual-panel-status">Search by venue code or room name.</p>
          )}
          <button type="button" onClick={onOpenShuttle}>
            Browse shuttle routes
          </button>
        </div>
      )}

      {state.mode === 'venue-detail' && state.selectedVenue && (
        <div className="contextual-panel-content contextual-panel-detail">
          <button type="button" onClick={onBack} aria-label="Back to venue search">
            Back
          </button>
          <h3>{state.selectedVenue.code}</h3>
          <p><strong>Room:</strong> {state.selectedVenue.venue.roomName}</p>
          {state.selectedVenue.venue.floor !== undefined && state.selectedVenue.venue.floor !== null && (
            <p><strong>Floor:</strong> {state.selectedVenue.venue.floor}</p>
          )}
          <button type="button" onClick={onOpenShuttle}>
            Browse shuttle routes
          </button>
        </div>
      )}

      {state.mode === 'shuttle' && (
        <div className="contextual-panel-content">
          <button type="button" onClick={onBack} aria-label="Back to previous map context">
            Back
          </button>
          <TransitRouteControl
            network={network}
            selectedRouteId={selectedRouteId}
            onRouteSelect={onRouteSelect}
          />
        </div>
      )}
    </section>
  )
}
