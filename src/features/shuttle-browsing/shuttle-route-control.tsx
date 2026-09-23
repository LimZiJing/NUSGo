import type { RefObject } from 'react'
import type { TransitNetworkIndex } from '../../domain/transit'
import type { TransitNetwork, TransitRoute } from '../../domain/transit/types'

interface ShuttleRouteControlProps {
  network: TransitNetwork | null
  networkIndex: TransitNetworkIndex | null
  selectedRouteId: string | null
  onRouteSelect: (routeId: string | null) => void
  selectRef?: RefObject<HTMLSelectElement | null>
}

function getRouteStops(
  networkIndex: TransitNetworkIndex,
  route: TransitRoute,
): Map<string, TransitNetwork['stops'][number]> {
  const stopsById = networkIndex.stopById
  return new Map(
    route.stopIds.map((stopId) => [stopId, stopsById.get(stopId)])
      .filter((entry): entry is [string, TransitNetwork['stops'][number]] => entry[1] !== undefined),
  )
}

function getStopLabel(
  stop: TransitNetwork['stops'][number] | undefined,
  fallbackId: string,
): string {
  return stop ? stop.longName + ' (' + stop.id + ')' : fallbackId
}

export function ShuttleRouteControl({
  network,
  networkIndex,
  selectedRouteId,
  onRouteSelect,
  selectRef,
}: ShuttleRouteControlProps) {
  const routes = networkIndex?.routes ?? network?.routes ?? []
  const selectedRoute = selectedRouteId && networkIndex
    ? networkIndex.routeById.get(selectedRouteId)
    : undefined
  const stopsById = selectedRoute && networkIndex
    ? getRouteStops(networkIndex, selectedRoute)
    : new Map<string, TransitNetwork['stops'][number]>()
  const firstStopId = selectedRoute?.stopIds[0] ?? ''
  const lastStopId = selectedRoute?.stopIds.at(-1) ?? ''
  const firstStop = stopsById.get(firstStopId)
  const lastStop = stopsById.get(lastStopId)
  const totalStopCount = networkIndex?.stops.length ?? network?.stops.length ?? 0
  const visibleStopCount = selectedRoute?.stopIds.length ?? totalStopCount
  const announcement = selectedRoute
    ? 'Route ' + selectedRoute.name + ' selected. Direction: ' +
      getStopLabel(firstStop, firstStopId) + ' to ' +
      getStopLabel(lastStop, lastStopId) + '. ' +
      visibleStopCount + ' of ' + totalStopCount + ' shuttle stops shown.'
    : network
      ? 'Showing all ' + routes.length + ' shuttle routes and all ' + totalStopCount + ' shuttle stops.'
      : 'Loading shuttle routes…'

  return (
    <section className="route-control" aria-label="Shuttle route selection">
      <label htmlFor="route-select">Shuttle route</label>
      <select
        id="route-select"
        ref={selectRef}
        value={selectedRouteId ?? ''}
        onChange={(event) => onRouteSelect(event.target.value || null)}
        disabled={routes.length === 0}
      >
        <option value="">Show all routes</option>
        {routes.map((route) => (
          <option key={route.id} value={route.id}>
            {route.name}
          </option>
        ))}
      </select>

      {selectedRoute && (
        <div className="route-details">
          <div className="route-details-heading">
            <h2>{selectedRoute.name}</h2>
            <button type="button" onClick={() => onRouteSelect(null)}>
              Show all routes
            </button>
          </div>
          <p className="route-direction">
            <strong>Direction:</strong>{' '}
            {getStopLabel(firstStop, firstStopId)}
            {' → '}
            {getStopLabel(lastStop, lastStopId)}
          </p>
          <p className="route-stop-count">
            {visibleStopCount} of {totalStopCount} shuttle stops shown
          </p>
          <p className="route-stop-heading">Ordered stops</p>
          <ol className="route-stop-list">
            {selectedRoute.stopIds.map((stopId, index) => (
              <li key={`${stopId}-${index}`}>{getStopLabel(stopsById.get(stopId), stopId)}</li>
            ))}
          </ol>
        </div>
      )}

      <p className="route-selection-status" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  )
}
