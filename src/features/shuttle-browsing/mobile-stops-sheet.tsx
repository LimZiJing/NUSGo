import type { CSSProperties, Ref } from 'react'
import type { TripEndpointRole } from '../../domain/trip/types'
import { getRouteContrastTextColor } from '../../ui/route-color'
import { MobileSheetHandle } from '../../ui/mobile-sheet-handle'

export interface MobileStopSheetSelection {
  readonly id: string
  readonly longName: string
  readonly oppositeStopId: string | null
  readonly publicServices: readonly string[]
  readonly services: readonly {
    readonly id: string
    readonly name: string
    readonly color: string
  }[]
}

interface MobileStopsSheetProps {
  readonly expanded: boolean
  readonly selectedStop: MobileStopSheetSelection | null
  readonly onExpandedChange: (expanded: boolean) => void
  readonly onSetEndpoint: (role: TripEndpointRole, stopId: string) => void
  readonly onBeforeSheetToggle?: () => void
  readonly containerRef?: Ref<HTMLElement>
}

export function MobileStopsSheet({
  expanded,
  selectedStop,
  onExpandedChange,
  onSetEndpoint,
  onBeforeSheetToggle,
  containerRef,
}: MobileStopsSheetProps) {
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
      <header className="mobile-stops-sheet-header">
        <h2 id="mobile-stops-sheet-heading">
          {selectedStop ? `Stop · ${selectedStop.id}` : 'Stops'}
        </h2>
      </header>
      <div
        id="mobile-stops-sheet-content"
        data-mobile-sheet-content
        hidden={!expanded}
      >
        {selectedStop ? (
          <div className="mobile-stop-selection">
            <p className="mobile-stop-selection-name">{selectedStop.longName}</p>
            {selectedStop.oppositeStopId ? (
              <p className="mobile-stop-context">Opposite stop: {selectedStop.oppositeStopId}</p>
            ) : null}
            {selectedStop.services.length > 0 ? (
              <section>
                <h3>Shuttle services</h3>
                <ul className="mobile-stop-service-list" aria-label="Shuttle route services">
                  {selectedStop.services.map((service) => (
                    <li key={service.id}>
                      <span
                        className="mobile-stop-service"
                        title={service.name}
                        style={{
                          '--route-color': service.color,
                          '--route-text-color': getRouteContrastTextColor(service.color),
                        } as CSSProperties}
                      >
                        {service.id}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p>No internal shuttle routes serve this stop.</p>
            )}
            {selectedStop.publicServices.length > 0 ? (
              <p className="mobile-stop-context">
                Public services: {selectedStop.publicServices.join(', ')}
              </p>
            ) : null}
            <div className="mobile-stop-endpoint-actions">
              <button
                className="mobile-stop-endpoint-primary"
                type="button"
                aria-label={`Set ${selectedStop.longName} as origin`}
                onClick={() => onSetEndpoint('origin', selectedStop.id)}
              >
                Set origin
              </button>
              <button
                type="button"
                aria-label={`Set ${selectedStop.longName} as destination`}
                onClick={() => onSetEndpoint('destination', selectedStop.id)}
              >
                Set destination
              </button>
            </div>
          </div>
        ) : (
          <p>Tap a shuttle stop on the map to view its details and route actions.</p>
        )}
      </div>
    </section>
  )
}
