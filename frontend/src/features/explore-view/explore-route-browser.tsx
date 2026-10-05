import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from 'react'
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

const ROUTE_DISPLAY_ORDER = ['A1', 'A2', 'D1', 'D2', 'R1', 'R2', 'K', 'P']
const ROUTE_DISPLAY_ORDER_INDEX = new Map(ROUTE_DISPLAY_ORDER.map((routeId, index) => [routeId, index]))

function orderRoutes(routes: readonly TransitRoute[]) {
  return [...routes].sort((left, right) => (
    (ROUTE_DISPLAY_ORDER_INDEX.get(left.id) ?? ROUTE_DISPLAY_ORDER.length)
      - (ROUTE_DISPLAY_ORDER_INDEX.get(right.id) ?? ROUTE_DISPLAY_ORDER.length)
  ))
}

function setRouteScrollLeft(routeList: HTMLDivElement, scrollLeft: number) {
  const maxScrollLeft = Math.max(0, routeList.scrollWidth - routeList.clientWidth)
  routeList.scrollLeft = Math.max(0, Math.min(maxScrollLeft, scrollLeft))
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
  const routeListRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startScrollLeft: number
    moved: boolean
  } | null>(null)
  const suppressChipClickRef = useRef(false)
  const [routeScrollState, setRouteScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  })
  const routes = orderRoutes(networkIndex?.routes ?? network?.routes ?? [])

  const updateRouteScrollState = useCallback(() => {
    const routeList = routeListRef.current
    if (!routeList) return

    const maxScrollLeft = Math.max(0, routeList.scrollWidth - routeList.clientWidth)
    const nextState = {
      canScrollLeft: routeList.scrollLeft > 4,
      canScrollRight: routeList.scrollLeft < maxScrollLeft - 4,
    }
    setRouteScrollState((current) => (
      current.canScrollLeft === nextState.canScrollLeft
      && current.canScrollRight === nextState.canScrollRight
        ? current
        : nextState
    ))
  }, [])

  const ensureSelectedRouteVisible = useCallback(() => {
    const routeList = routeListRef.current
    const selectedChip = selectedChipRef.current
    if (!routeList || !selectedChip || routeList.clientWidth <= 0 || selectedChip.offsetWidth <= 0) return

    const viewportStart = routeList.scrollLeft
    const viewportEnd = viewportStart + routeList.clientWidth
    const chipStart = selectedChip.offsetLeft
    const chipEnd = chipStart + selectedChip.offsetWidth
    if (chipStart >= viewportStart && chipEnd <= viewportEnd) return

    selectedChip.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const routeList = routeListRef.current
    if (!routeList) return

    const updateRouteLayout = () => {
      updateRouteScrollState()
      ensureSelectedRouteVisible()
    }

    updateRouteLayout()
    window.addEventListener('resize', updateRouteLayout)
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateRouteLayout)
    resizeObserver?.observe(routeList)

    return () => {
      window.removeEventListener('resize', updateRouteLayout)
      resizeObserver?.disconnect()
    }
  }, [ensureSelectedRouteVisible, routes.length, updateRouteScrollState])

  useEffect(() => {
    if (selectedRouteId) ensureSelectedRouteVisible()
  }, [ensureSelectedRouteVisible, routes.length, selectedRouteId])

  const selectedRoute = selectedRouteId && networkIndex
    ? networkIndex.routeById.get(selectedRouteId)
    : undefined
  const stopsById = selectedRoute && networkIndex
    ? getRouteStops(networkIndex, selectedRoute)
    : new Map<string, TransitNetwork['stops'][number]>()

  function scrollRoutes(direction: -1 | 1) {
    const routeList = routeListRef.current
    if (!routeList) return

    const distance = Math.max(120, routeList.clientWidth * 0.75)
    if (typeof routeList.scrollBy === 'function') {
      routeList.scrollBy({ left: direction * distance, behavior: 'smooth' })
      return
    }
    setRouteScrollLeft(routeList, routeList.scrollLeft + direction * distance)
    updateRouteScrollState()
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch') return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const routeList = routeListRef.current
    if (!routeList) return

    suppressChipClickRef.current = false
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: routeList.scrollLeft,
      moved: false,
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current
    const routeList = routeListRef.current
    if (!drag || drag.pointerId !== event.pointerId || !routeList) return

    const distance = event.clientX - drag.startX
    if (!drag.moved && Math.abs(distance) < 4) return

    drag.moved = true
    routeList.setPointerCapture?.(event.pointerId)
    event.preventDefault()
    setRouteScrollLeft(routeList, drag.startScrollLeft - distance)
    updateRouteScrollState()
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current
    const routeList = routeListRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    if (drag.moved) suppressChipClickRef.current = true
    dragRef.current = null
    if (routeList?.hasPointerCapture?.(event.pointerId)) routeList.releasePointerCapture(event.pointerId)
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
    event.preventDefault()
    const routeList = routeListRef.current
    if (!routeList) return

    if (typeof routeList.scrollBy === 'function') {
      routeList.scrollBy({ left: event.deltaY, behavior: 'smooth' })
      return
    }
    setRouteScrollLeft(routeList, routeList.scrollLeft + event.deltaY)
    updateRouteScrollState()
  }

  function handleRouteKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const routeList = routeListRef.current
    if (!routeList) return

    if (event.key === 'Home') setRouteScrollLeft(routeList, 0)
    if (event.key === 'End') setRouteScrollLeft(routeList, routeList.scrollWidth)
    if (event.key === 'ArrowLeft') {
      setRouteScrollLeft(routeList, routeList.scrollLeft - Math.max(120, routeList.clientWidth * 0.75))
    }
    if (event.key === 'ArrowRight') {
      setRouteScrollLeft(routeList, routeList.scrollLeft + Math.max(120, routeList.clientWidth * 0.75))
    }
    updateRouteScrollState()
  }

  function handleRouteClick(routeId: string) {
    if (suppressChipClickRef.current) {
      suppressChipClickRef.current = false
      return
    }
    onRouteSelect(routeId)
  }

  return (
    <section className="route-control" aria-label="Shuttle route selection">
      <h3 className="visually-hidden">Choose a shuttle route</h3>
      {routes.length > 0 && (
        <div
          className="route-chip-scroller"
          data-can-scroll-left={routeScrollState.canScrollLeft ? 'true' : undefined}
          data-can-scroll-right={routeScrollState.canScrollRight ? 'true' : undefined}
        >
          <ScrollArea
            ref={routeListRef}
            axis="horizontal"
            className="route-chip-list"
            role="group"
            aria-label="Shuttle routes"
            tabIndex={0}
            onScroll={updateRouteScrollState}
            onWheel={handleWheel}
            onKeyDown={handleRouteKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onLostPointerCapture={handlePointerEnd}
          >
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
                onClick={() => handleRouteClick(route.id)}
              />
            ))}
          </ScrollArea>
          <button
            className="route-scroll-arrow route-scroll-arrow-left"
            type="button"
            aria-label="Scroll shuttle routes left"
            hidden={!routeScrollState.canScrollLeft}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onLostPointerCapture={handlePointerEnd}
            onClick={() => scrollRoutes(-1)}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            className="route-scroll-arrow route-scroll-arrow-right"
            type="button"
            aria-label="Scroll shuttle routes right"
            hidden={!routeScrollState.canScrollRight}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onLostPointerCapture={handlePointerEnd}
            onClick={() => scrollRoutes(1)}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      )}
      {selectedRoute ? (
        <div className="mobile-sheet-content route-timeline-card" data-mobile-sheet-content style={{ '--route-color': selectedRoute.color } as CSSProperties}>
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
