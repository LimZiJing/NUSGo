import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ContextualPanel } from './components/ContextualPanel'
import { TripEndpointControl } from './components/TripEndpointControl'
import { createNavigationSession, type NavigationSession } from './app/navigation-session'
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

    let navigationSession: NavigationSession | null = null
    const mapSession = createMapSession({
      container: mapContainer.current,
      onMapError: (error) => navigationSession?.reportMapError(error),
      onEmptyMapClick: () => navigationSession?.handleMapClick(),
    })
    navigationSession = createNavigationSession({
      map: mapSession,
      loadVenues: loadVenueData,
      loadTransit: loadTransitMapData,
    })
    setSession(navigationSession)

    const controller = new AbortController()
    void navigationSession.start(controller.signal)

    return () => {
      controller.abort()
      navigationSession?.dispose()
      navigationSession = null
      setSession(null)
    }
  }, [])

  const tripValidation = validateTripRequest(state.tripRequest)
  const selectedRouteColor = state.transitIndex?.routeById.get(state.selectedRouteId ?? '')?.color ?? '#334155'

  return (
    <main className="map-shell">
      <div ref={mapContainer} className="map" />
      <div className="map-overlay-right">
        <section className="trip-controls" aria-label="Trip endpoints">
          <div className="trip-controls-heading">
            <h2>Trip endpoints</h2>
            <button
              type="button"
              onClick={() => session?.swapTripEndpoints()}
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
            onSearchQueryChange={(query) => session?.setOriginSearchQuery(query)}
            onSelect={(endpoint) => session?.setTripEndpoint('origin', endpoint)}
            onClear={() => session?.clearTripEndpoint('origin')}
          />
          <TripEndpointControl
            role="destination"
            endpoint={state.tripRequest.destination}
            venues={state.venues}
            networkIndex={state.transitIndex}
            searchQuery={state.destinationSearchQuery}
            onSearchQueryChange={(query) => session?.setDestinationSearchQuery(query)}
            onSelect={(endpoint) => session?.setTripEndpoint('destination', endpoint)}
            onClear={() => session?.clearTripEndpoint('destination')}
          />
          <button
            type="button"
            className="trip-clear-both"
            onClick={() => session?.clearTrip()}
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
          onQueryChange={(query) => session?.setContextualPanelQuery(query)}
          onVenueSelect={(result) => session?.selectVenue(result)}
          onOpenVenueSearch={() => session?.openVenueSearch()}
          onOpenShuttle={() => session?.openShuttle()}
          onBack={() => session?.back()}
          onClose={() => session?.close()}
          onEscape={() => session?.escape()}
          onRouteSelect={(routeId) => session?.selectRoute(routeId)}
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
