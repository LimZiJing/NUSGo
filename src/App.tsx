import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ContextualPanel } from './components/ContextualPanel'
import { TripEndpointControl } from './components/TripEndpointControl'
import { createNavigationSession, type NavigationSession } from './app/navigation-session'
import {
  createNavigationSessionCommandAdapter,
  createNavigationSessionMount,
} from './app/navigation-session-mount'
import { useNavigationSession } from './app/use-navigation-session'
import { loadTransitMapData, loadVenueData } from './infrastructure/data/loaders'
import { createMapSession } from './infrastructure/map/session'
import { validateTripRequest } from './domain/trip/endpoints'
import './App.css'

function App() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<NavigationSession | null>(null)
  const state = useNavigationSession(session)

  useEffect(() => {
    if (!mapContainer.current) return

    const mount = createNavigationSessionMount(mapContainer.current, {
      createMapSession,
      createNavigationSession,
      loadVenues: loadVenueData,
      loadTransit: loadTransitMapData,
    })
    setSession(mount.session)

    return () => {
      mount.dispose()
    }
  }, [])

  const commandAdapter = useMemo(() => createNavigationSessionCommandAdapter(), [])
  const commands = commandAdapter(session)

  const tripValidation = validateTripRequest(state.tripRequest)
  const selectedRouteColor = state.selectedRouteColor ?? '#334155'

  return (
    <main className="map-shell">
      <div ref={mapContainer} className="map" />
      <div className="map-overlay-right">
        <section className="trip-controls" aria-label="Trip endpoints">
          <div className="trip-controls-heading">
            <h2>Trip endpoints</h2>
            <button
              type="button"
              onClick={commands.swapTripEndpoints}
              disabled={!state.tripRequest.origin || !state.tripRequest.destination}
              aria-label="Swap origin and destination"
            >
              Swap
            </button>
          </div>
          <TripEndpointControl
            role="origin"
            endpoint={state.tripRequest.origin}
            venues={state.venues}
            networkIndex={state.transitIndex}
            searchQuery={state.originSearchQuery}
            onSearchQueryChange={commands.setOriginSearchQuery}
            onSelect={commands.selectOriginEndpoint}
            onClear={commands.clearOriginEndpoint}
          />
          <TripEndpointControl
            role="destination"
            endpoint={state.tripRequest.destination}
            venues={state.venues}
            networkIndex={state.transitIndex}
            searchQuery={state.destinationSearchQuery}
            onSearchQueryChange={commands.setDestinationSearchQuery}
            onSelect={commands.selectDestinationEndpoint}
            onClear={commands.clearDestinationEndpoint}
          />
          <button
            type="button"
            className="trip-clear-both"
            onClick={commands.clearTrip}
            disabled={!state.tripRequest.origin && !state.tripRequest.destination}
          >
            Clear both endpoints
          </button>
          <p className="trip-validation" role="status" aria-live="polite" aria-atomic="true">
            {tripValidation ?? 'Origin and destination are set.'}
          </p>
        </section>
        <ContextualPanel
          state={state.contextualPanel}
          venues={state.venues}
          network={state.transitIndex?.network ?? null}
          networkIndex={state.transitIndex}
          selectedRouteId={state.selectedRouteId}
          onQueryChange={commands.setContextualPanelQuery}
          onVenueSelect={commands.selectVenue}
          onOpenVenueSearch={commands.openVenueSearch}
          onOpenShuttle={commands.openShuttle}
          onBack={commands.back}
          onClose={commands.close}
          onEscape={commands.escape}
          onRouteSelect={commands.selectRoute}
        />
      </div>
      <aside
        className="map-legend"
        aria-label="Map legend"
        style={{ '--bus-stop-selected-color': selectedRouteColor } as CSSProperties}
      >
        <div><span className="legend-marker venue-marker" /> Venues</div>
        <div className="bus-stop-legend-item">
          <span className="bus-stop-legend-marker bus-stop-legend-marker-selected" aria-hidden="true" />
          On selected route
        </div>
        <div className="bus-stop-legend-item">
          <span className="bus-stop-legend-marker bus-stop-legend-marker-other" aria-hidden="true" />
          Other shuttle stop
        </div>
        <div><span className="legend-marker origin-marker" /> Origin</div>
        <div><span className="legend-marker destination-marker" /> Destination</div>
      </aside>
      <div className="map-status" role="status">
        {state.status}
      </div>
    </main>
  )
}

export default App
