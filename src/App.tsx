import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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
    void navigationSession.start(controller.signal).catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Navigation session startup failed:', error)
    })

    return () => {
      controller.abort()
      navigationSession?.dispose()
      navigationSession = null
    }
  }, [])

  const commands = useMemo(() => ({
    swapTripEndpoints: () => session?.swapTripEndpoints(),
    setOriginSearchQuery: (query: string) => session?.setOriginSearchQuery(query),
    selectOriginEndpoint: (endpoint: Parameters<NavigationSession['setTripEndpoint']>[1]) => (
      session?.setTripEndpoint('origin', endpoint)
    ),
    clearOriginEndpoint: () => session?.clearTripEndpoint('origin'),
    setDestinationSearchQuery: (query: string) => session?.setDestinationSearchQuery(query),
    selectDestinationEndpoint: (endpoint: Parameters<NavigationSession['setTripEndpoint']>[1]) => (
      session?.setTripEndpoint('destination', endpoint)
    ),
    clearDestinationEndpoint: () => session?.clearTripEndpoint('destination'),
    clearTrip: () => session?.clearTrip(),
    setContextualPanelQuery: (query: string) => session?.setContextualPanelQuery(query),
    selectVenue: (result: Parameters<NavigationSession['selectVenue']>[0]) => session?.selectVenue(result),
    openVenueSearch: () => session?.openVenueSearch(),
    openShuttle: () => session?.openShuttle(),
    back: () => session?.back(),
    close: () => session?.close(),
    escape: () => session?.escape(),
    selectRoute: (routeId: string | null) => session?.selectRoute(routeId),
  }), [session])

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
