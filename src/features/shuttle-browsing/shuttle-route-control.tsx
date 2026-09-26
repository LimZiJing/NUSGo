import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import type { TransitNetworkIndex } from '../../domain/transit'
import type { TransitNetwork, TransitRoute } from '../../domain/transit/types'
import { getRouteChipTextColor } from '../../ui/route-color'

interface ShuttleRouteControlProps {
  network: TransitNetwork | null
  networkIndex: TransitNetworkIndex | null
  selectedRouteId: string | null
  onRouteSelect: (routeId: string | null) => void
  selectRef?: RefObject<HTMLSelectElement | null>
  mobileViewport?: boolean
  firstRouteCardRef?: RefObject<HTMLButtonElement | null>
  onFocusStop?: (stopId: string) => void
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
  mobileViewport = false,
  firstRouteCardRef,
  onFocusStop,
}: ShuttleRouteControlProps) {
  const selectedChipRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (mobileViewport && selectedRouteId) {
      selectedChipRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    }
  }, [mobileViewport, selectedRouteId])
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

  if (mobileViewport) {
    return (
      <section className="route-control route-control-mobile" aria-label="Shuttle route selection">
        <h3 className="visually-hidden">Choose a shuttle route</h3>
        {routes.length > 0 && (
          <div className="route-chip-list" role="group" aria-label="Shuttle routes">
            {routes.map((route, index) => (
              <button
                key={route.id}
                ref={(element) => {
                  if (index === 0 && firstRouteCardRef) firstRouteCardRef.current = element
                  if (selectedRouteId === route.id) selectedChipRef.current = element
                }}
                className="route-chip"
                type="button"
                data-route-id={route.id}
                data-contextual-focus-id={`shuttle-route-${route.id}`}
                style={{ '--route-color': route.color, '--route-text-color': getRouteChipTextColor(route.color) } as CSSProperties}
                aria-label={`Route ${route.id}`}
                aria-pressed={selectedRouteId === route.id}
                onClick={() => onRouteSelect(route.id)}
              >
                {route.id}
              </button>
            ))}
          </div>
        )}
        {selectedRoute ? (
          <div className="route-timeline-card" data-mobile-sheet-content style={{ '--route-color': selectedRoute.color } as CSSProperties}>
            <p className="route-timeline-count">{selectedRoute.stopIds.length} stops</p>
            <ol className="route-timeline" aria-label={`Route ${selectedRoute.id} ordered stops`}>
              {selectedRoute.stopIds.map((stopId, index) => {
                const stop = stopsById.get(stopId)
                return (
                  <li key={`${stopId}-${index}`}>
                    <button
                      type="button"
                      className="route-timeline-stop"
                      data-route-stop-id={stopId}
                      aria-label={`${stop?.longName ?? stopId}, stop ${stopId}. Focus on map`}
                      onClick={() => onFocusStop?.(stopId)}
                    >
                      <span className="route-timeline-node" aria-hidden="true" />
                      <span className="route-timeline-text">
                        <strong>{stop?.shortName || stop?.longName || stopId}</strong>
                        <small>{stopId}</small>
                      </span>
                      <span className="route-timeline-chevron" aria-hidden="true">›</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        ) : (
          <p className="route-selection-status" role="status" aria-live="polite">
            {!network ? 'Loading shuttle routes…' : 'Shuttle route data is unavailable.'}
          </p>
        )}
        <p className="visually-hidden" role="status" aria-live="polite">
          {selectedRoute ? `Route ${selectedRoute.id} selected. ${selectedRoute.stopIds.length} stops in route order.` : ''}
        </p>
      </section>
    )
  }

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
