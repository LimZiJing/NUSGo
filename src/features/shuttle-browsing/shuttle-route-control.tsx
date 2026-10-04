import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import type { TransitNetworkIndex } from '../../domain/transit'
import type { TransitNetwork, TransitRoute } from '../../domain/transit/types'
import { RouteChip } from '../../ui/route-chip'
import { ScrollArea } from '../../ui/scroll-area'

interface ShuttleRouteControlProps {
  network: TransitNetwork | null
  networkIndex: TransitNetworkIndex | null
  selectedRouteId: string | null
  onRouteSelect: (routeId: string) => void
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

export function ShuttleRouteControl({
  network,
  networkIndex,
  selectedRouteId,
  onRouteSelect,
  firstRouteCardRef,
  onFocusStop,
}: ShuttleRouteControlProps) {
  const selectedChipRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (selectedRouteId) {
      selectedChipRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    }
  }, [selectedRouteId])

  const routes = networkIndex?.routes ?? network?.routes ?? []
  const selectedRoute = selectedRouteId && networkIndex
    ? networkIndex.routeById.get(selectedRouteId)
    : undefined
  const stopsById = selectedRoute && networkIndex
    ? getRouteStops(networkIndex, selectedRoute)
    : new Map<string, TransitNetwork['stops'][number]>()
  return (
    <section className="route-control" aria-label="Shuttle route selection">
      <h3 className="visually-hidden">Choose a shuttle route</h3>
      {routes.length > 0 && (
        <ScrollArea axis="horizontal" className="route-chip-list" role="group" aria-label="Shuttle routes">
          {routes.map((route, index) => (
            <RouteChip
              key={route.id}
              buttonRef={(element) => {
                if (index === 0 && firstRouteCardRef) firstRouteCardRef.current = element
                if (selectedRouteId === route.id) selectedChipRef.current = element
              }}
              routeId={route.id}
              routeColor={route.color}
              focusId={`shuttle-route-${route.id}`}
              ariaLabel={`Route ${route.id}`}
              active={selectedRouteId === route.id}
              pressed={selectedRouteId === route.id}
              onClick={() => onRouteSelect(route.id)}
            />
          ))}
        </ScrollArea>
      )}
      {selectedRoute ? (
        <div className="route-timeline-card" data-mobile-sheet-content style={{ '--route-color': selectedRoute.color } as CSSProperties}>
          <p className="route-timeline-count">{selectedRoute.stopIds.length} stops</p>
          <ScrollArea className="route-timeline-scroll">
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
          </ScrollArea>
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
