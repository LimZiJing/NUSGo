import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ContextualPanel } from './components/ContextualPanel'
import { TripEndpointControls } from './components/TripEndpointControl'
import { createNavigationSession, type NavigationSession } from './app/navigation-session'
import {
  createNavigationSessionCommandAdapter,
  createNavigationSessionMount,
} from './app/navigation-session-mount'
import { useNavigationSession } from './app/use-navigation-session'
import { loadTransitMapData, loadVenueData } from './infrastructure/data/loaders'
import { createMapSession } from './infrastructure/map/session'
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

  const selectedRouteColor = state.selectedRouteColor ?? '#334155'

  return (
    <main className="map-shell">
      <div ref={mapContainer} className="map" />
      <div className="map-overlay-right">
        <TripEndpointControls
          tripRequest={state.tripRequest}
          venues={state.venues}
          networkIndex={state.transitIndex}
          onSwap={commands.swapTripEndpoints}
          onSelectOriginEndpoint={commands.selectOriginEndpoint}
          onClearOriginEndpoint={commands.clearOriginEndpoint}
          onSelectDestinationEndpoint={commands.selectDestinationEndpoint}
          onClearDestinationEndpoint={commands.clearDestinationEndpoint}
          onClearTrip={commands.clearTrip}
        />
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
