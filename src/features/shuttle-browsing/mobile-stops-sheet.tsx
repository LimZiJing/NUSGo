import type { Ref } from 'react'
import { GhostBackButton } from '../../ui/ghost-back-button'
import { MobileSheetHandle } from '../../ui/mobile-sheet-handle'
import { NavigateButton } from '../../ui/navigate-button'
import { BusStopCard } from '../../ui/bus-stop-card'
import { BusStopTimings, type BusStopDeparture, type BusStopScheduledDeparture } from '../../ui/bus-stop-timings'
import { FavoriteStarIcon } from '../../ui/favorite-star-icon'
import { type MobileStopDeparture } from './mobile-stop-view'

type MobileStopSheetDeparture = MobileStopDeparture & BusStopDeparture

export interface MobileStopSheetSelection {
  readonly id: string
  readonly longName: string
  readonly oppositeStop: { readonly id: string; readonly longName: string } | null
  readonly publicServices: readonly string[]
  readonly departures: readonly MobileStopSheetDeparture[]
  readonly scheduledDepartures: readonly BusStopScheduledDeparture[]
  readonly live: boolean
  readonly liveArrivalMessage: string | null
}

export interface MobileStopOverviewSelection {
  readonly stop: MobileStopSheetSelection
  readonly distanceMeters: number | null
  readonly favorite: boolean
  readonly expanded: boolean
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
  readonly overviewStops?: readonly MobileStopOverviewSelection[]
  readonly overviewLoading?: boolean
  readonly selectedList?: 'nearby' | 'favourites'
  readonly selectedStopFavorite?: boolean
  readonly locationNotice?: string | null
  readonly liveArrivalMessage?: string | null
  readonly onSelectList?: (list: 'nearby' | 'favourites') => void
  readonly onToggleFavorite?: (stopId: string) => void
  readonly onToggleExpanded?: (stopId: string) => void
  readonly onDismissLocationNotice?: () => void
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
  overviewStops,
  overviewLoading = false,
  selectedList = 'nearby',
  selectedStopFavorite = false,
  locationNotice = null,
  liveArrivalMessage = null,
  onSelectList,
  onToggleFavorite,
  onToggleExpanded,
  onDismissLocationNotice,
}: MobileStopsSheetProps) {
  const oppositeStop = selectedStop?.oppositeStop ?? null

  return (
    <section
      className="mobile-stops-sheet"
      aria-label="Stops"
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
      <div
        id="mobile-stops-sheet-content"
        data-mobile-sheet-content
        data-view={selectedStop ? 'selected' : 'overview'}
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
              <button
                className="mobile-stop-favorite"
                type="button"
                aria-label={`${selectedStopFavorite ? 'Remove' : 'Add'} ${selectedStop.longName} ${selectedStopFavorite ? 'from' : 'to'} favourites`}
                aria-pressed={selectedStopFavorite}
                onClick={() => onToggleFavorite?.(selectedStop.id)}
              >
                <FavoriteStarIcon filled={selectedStopFavorite} />
              </button>
            </div>
            <div className="mobile-stop-actions">
              <NavigateButton
                ariaLabel="Navigate to this stop"
                onClick={() => onNavigateToStop(selectedStop.id)}
              />
              {oppositeStop ? (
                <button
                  className="mobile-stop-opposite"
                  type="button"
                  aria-label={`Opposite stop: ${oppositeStop.longName}, ${oppositeStop.id}`}
                  title={`${oppositeStop.longName} (${oppositeStop.id})`}
                  onClick={() => onSelectOppositeStop(oppositeStop.id)}
                >
                  Opposite stop <span aria-hidden="true">›</span>
                </button>
              ) : null}
            </div>
            {liveArrivalMessage && (
              <p className="mobile-stop-live-arrival-message" role="status">
                {liveArrivalMessage}
              </p>
            )}
            <div className="mobile-stop-departures">
              <BusStopTimings
                departures={selectedStop.departures}
                scheduledDepartures={selectedStop.scheduledDepartures}
                liveArrivalMessage={selectedStop.liveArrivalMessage}
                publicServices={selectedStop.publicServices.map((serviceNumber) => ({
                  serviceNumber,
                  timings: null,
                }))}
                onSelectRoute={onSelectRoute}
              />
            </div>
          </div>
        ) : overviewStops ? (
          <div className="mobile-stops-overview">
            <div className="mobile-stops-list-selector" role="group" aria-label="Stop list">
              <button type="button" aria-pressed={selectedList === 'nearby'} onClick={() => onSelectList?.('nearby')}>Nearby</button>
              <button type="button" aria-pressed={selectedList === 'favourites'} onClick={() => onSelectList?.('favourites')}>Favourites</button>
            </div>
            {liveArrivalMessage && (
              <p className="mobile-stop-live-arrival-message" role="status">
                {liveArrivalMessage}
              </p>
            )}
            {locationNotice && selectedList === 'nearby' && (
              <div className="mobile-stops-location-notice" role="status">
                <span>{locationNotice}</span>
                <button type="button" aria-label="Dismiss location notice" onClick={onDismissLocationNotice}>×</button>
              </div>
            )}
            {overviewStops.length ? (
              <div className="mobile-stops-card-list">
                {overviewStops.map(({ stop, distanceMeters, favorite, expanded }) => (
                  <BusStopCard
                    key={stop.id}
                    stopId={stop.id}
                    stopName={stop.longName}
                    distanceMeters={distanceMeters}
                    favorite={favorite}
                    expanded={expanded}
                    live={stop.live}
                    liveArrivalMessage={stop.liveArrivalMessage}
                    departures={stop.departures}
                    scheduledDepartures={stop.scheduledDepartures}
                    publicServices={stop.publicServices.map((serviceNumber) => ({
                      serviceNumber,
                      timings: null,
                    }))}
                    onToggleFavorite={(stopId) => onToggleFavorite?.(stopId)}
                    onToggleExpanded={(stopId) => onToggleExpanded?.(stopId)}
                    onSelectRoute={onSelectRoute}
                  />
                ))}
              </div>
            ) : (
              <p className="mobile-stops-empty">
                {overviewLoading
                  ? 'Loading stops…'
                  : selectedList === 'favourites'
                  ? 'No favourite stops yet. Star a stop to save it here.'
                  : 'No stops within 1.5 km of the map centre.'}
              </p>
            )}
          </div>
        ) : (
          <p>Tap a shuttle stop on the map to view its details and route actions.</p>
        )}
      </div>
    </section>
  )
}
