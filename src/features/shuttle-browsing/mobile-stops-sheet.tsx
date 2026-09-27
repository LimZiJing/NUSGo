import type { Ref } from 'react'
import { GhostBackButton } from '../../ui/ghost-back-button'
import { MobileSheetHandle } from '../../ui/mobile-sheet-handle'
import { PublicServiceChip, RouteChip } from '../../ui/route-chip'
import { getPublicServiceTimings, type MobileStopDeparture } from './mobile-stop-view'

interface MobileStopSheetDeparture extends MobileStopDeparture {
  readonly routeName: string
  readonly routeColor: string
}

export interface MobileStopSheetSelection {
  readonly id: string
  readonly longName: string
  readonly oppositeStop: { readonly id: string; readonly longName: string } | null
  readonly publicServices: readonly string[]
  readonly departures: readonly MobileStopSheetDeparture[]
}

interface MobileStopsSheetProps {
  readonly expanded: boolean
  readonly selectedStop: MobileStopSheetSelection | null
  readonly onExpandedChange: (expanded: boolean) => void
  readonly onBackToStops: () => void
  readonly onSelectOppositeStop: (stopId: string) => void
  readonly onSelectRoute: (routeId: string) => void
  readonly onNavigateToStop: (stopId: string) => void
  readonly onBeforeSheetToggle?: () => void
  readonly containerRef?: Ref<HTMLElement>
}

function DepartureTimes({ timings }: { readonly timings: readonly [string, string, string] }) {
  return timings.map((timing, index) => (
    <span
      key={index}
      className="mobile-stop-departure-time"
      data-timing-state={timing === 'Arr' || timing === 'Left' ? timing : undefined}
    >
      {timing}
    </span>
  ))
}

export function MobileStopsSheet({
  expanded,
  selectedStop,
  onExpandedChange,
  onBackToStops,
  onSelectOppositeStop,
  onSelectRoute,
  onNavigateToStop,
  onBeforeSheetToggle,
  containerRef,
}: MobileStopsSheetProps) {
  const oppositeStop = selectedStop?.oppositeStop ?? null

  return (
    <section
      className="mobile-stops-sheet"
      aria-labelledby="mobile-stops-sheet-heading"
      data-mobile-sheet
      data-expanded={expanded}
      ref={containerRef}
    >
      <div className="mobile-sheet-handle-row">
        <MobileSheetHandle
          expanded={expanded}
          label="Stops panel"
          controlsId="mobile-stops-sheet-content"
          onBeforeClick={onBeforeSheetToggle}
          onExpandedChange={onExpandedChange}
        />
      </div>
      {!selectedStop && (
        <header className="mobile-stops-sheet-header">
          <h2 id="mobile-stops-sheet-heading">Stops</h2>
        </header>
      )}
      <div
        id="mobile-stops-sheet-content"
        data-mobile-sheet-content
        hidden={!expanded}
      >
        {selectedStop ? (
          <div className="mobile-stop-selection" data-testid="mobile-stop-detail">
            <GhostBackButton label="Back to stops" onClick={onBackToStops} />
            <div className="mobile-stop-identity">
              <div className="mobile-stop-identity-copy">
                <h2 id="mobile-stops-sheet-heading" className="mobile-stop-selection-name">
                  {selectedStop.longName}
                </h2>
                <span className="mobile-stop-id">{selectedStop.id}</span>
              </div>
              <span className="mobile-stop-favorite" aria-hidden="true">☆</span>
            </div>
            <button
              className="mobile-stop-directions"
              type="button"
              aria-label="Directions to this stop"
              onClick={() => onNavigateToStop(selectedStop.id)}
            >
              <span aria-hidden="true">➤</span> Directions to this stop
            </button>
            <section className="mobile-stop-departures">
              <h3>Upcoming departures</h3>
              {selectedStop.departures.length > 0 || selectedStop.publicServices.length > 0 ? (
                <ul className="mobile-stop-departure-list" aria-label="Upcoming bus departures">
                  {selectedStop.departures.map((departure) => (
                    <li key={departure.routeId} className="mobile-stop-departure-row">
                      <RouteChip
                        routeId={departure.routeId}
                        routeColor={departure.routeColor}
                        ariaLabel={`View ${departure.routeId} route details`}
                        title={departure.routeName}
                        active
                        onClick={() => onSelectRoute(departure.routeId)}
                      />
                      <DepartureTimes timings={departure.timings} />
                    </li>
                  ))}
                  {selectedStop.publicServices.map((serviceNumber) => (
                    <li key={`public-${serviceNumber}`} className="mobile-stop-departure-row">
                      <PublicServiceChip serviceNumber={serviceNumber} />
                      <DepartureTimes timings={getPublicServiceTimings(serviceNumber)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No upcoming bus departures.</p>
              )}
            </section>
            {oppositeStop ? (
              <button
                className="mobile-stop-opposite"
                type="button"
                aria-label={`Opposite stop: ${oppositeStop.longName}, ${oppositeStop.id}`}
                onClick={() => onSelectOppositeStop(oppositeStop.id)}
              >
                <span>Opposite stop</span>
                <strong>{oppositeStop.longName}</strong>
                <span className="mobile-stop-opposite-id">{oppositeStop.id}</span>
                <span aria-hidden="true">›</span>
              </button>
            ) : null}
          </div>
        ) : (
          <p>Tap a shuttle stop on the map to view its details and route actions.</p>
        )}
      </div>
    </section>
  )
}
