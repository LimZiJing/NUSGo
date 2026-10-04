import { GhostBackButton } from '../../ui/ghost-back-button'
import { NavigateButton } from '../../ui/navigate-button'
import { BusStopCard } from '../../ui/bus-stop-card'
import {
  BusStopTimings,
  type BusStopDeparture,
  type BusStopScheduledDeparture,
  type PublicServiceTiming,
} from '../../ui/bus-stop-timings'
import { FavoriteStarIcon } from '../../ui/favorite-star-icon'
import { type StopDeparture } from './stops-view-state'

type StopSheetDeparture = StopDeparture & BusStopDeparture

export interface StopSheetSelection {
  readonly id: string
  readonly longName: string
  readonly oppositeStop: { readonly id: string; readonly longName: string } | null
  readonly publicServices: readonly PublicServiceTiming[]
  readonly departures: readonly StopSheetDeparture[]
  readonly scheduledDepartures: readonly BusStopScheduledDeparture[]
  readonly live: boolean
  readonly liveArrivalMessage: string | null
}

export interface StopOverviewSelection {
  readonly stop: StopSheetSelection
  readonly distanceMeters: number | null
  readonly favorite: boolean
  readonly expanded: boolean
}

interface StopsViewProps {
  readonly expanded?: boolean
  readonly selectedStop: StopSheetSelection | null
  readonly onBackToStops: () => void
  readonly onSelectOppositeStop: (stopId: string) => void
  readonly onSelectRoute: (routeId: string) => void
  readonly onNavigateToStop: (stopId: string) => void
  readonly overviewStops?: readonly StopOverviewSelection[]
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

export function StopsView({
  expanded = true,
  selectedStop,
  onBackToStops,
  onSelectOppositeStop,
  onSelectRoute,
  onNavigateToStop,
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
}: StopsViewProps) {
  const oppositeStop = selectedStop?.oppositeStop ?? null
  const isExpanded = expanded

  return (
    <div
      id="stops-view-content"
      data-mobile-sheet-content
      data-view={selectedStop ? 'selected' : 'overview'}
      hidden={!isExpanded}
    >
        {selectedStop ? (
          <div className="stop-selection" data-testid="stop-detail">
            <GhostBackButton label="Back to stops" onClick={onBackToStops} />
            <div className="stop-identity">
              <div className="stop-identity-copy">
                <h2 id="stops-view-heading" className="stop-selection-name">
                  {selectedStop.longName}
                </h2>
                <span className="stop-id">{selectedStop.id}</span>
              </div>
              <button
                className="stop-favorite"
                type="button"
                aria-label={`${selectedStopFavorite ? 'Remove' : 'Add'} ${selectedStop.longName} ${selectedStopFavorite ? 'from' : 'to'} favourites`}
                aria-pressed={selectedStopFavorite}
                onClick={() => onToggleFavorite?.(selectedStop.id)}
              >
                <FavoriteStarIcon filled={selectedStopFavorite} />
              </button>
            </div>
            <div className="stop-actions">
              <NavigateButton
                ariaLabel="Navigate to this stop"
                onClick={() => onNavigateToStop(selectedStop.id)}
              />
              {oppositeStop ? (
                <button
                  className="stop-opposite"
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
              <p className="stop-live-arrival-message" role="status">
                {liveArrivalMessage}
              </p>
            )}
            <div className="stop-departures">
              <BusStopTimings
                departures={selectedStop.departures}
                scheduledDepartures={selectedStop.scheduledDepartures}
                liveArrivalMessage={selectedStop.liveArrivalMessage}
                publicServices={selectedStop.publicServices}
                onSelectRoute={onSelectRoute}
              />
            </div>
          </div>
        ) : overviewStops ? (
          <div className="stops-overview">
            <div className="stops-list-selector" role="group" aria-label="Stop list">
              <button type="button" aria-pressed={selectedList === 'nearby'} onClick={() => onSelectList?.('nearby')}>Nearby</button>
              <button type="button" aria-pressed={selectedList === 'favourites'} onClick={() => onSelectList?.('favourites')}>Favourites</button>
            </div>
            {liveArrivalMessage && (
              <p className="stop-live-arrival-message" role="status">
                {liveArrivalMessage}
              </p>
            )}
            {locationNotice && selectedList === 'nearby' && (
              <div className="stops-location-notice" role="status">
                <span>{locationNotice}</span>
                <button type="button" aria-label="Dismiss location notice" onClick={onDismissLocationNotice}>×</button>
              </div>
            )}
            {overviewStops.length ? (
              <div className="stops-card-list">
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
                    publicServices={stop.publicServices}
                    onToggleFavorite={(stopId) => onToggleFavorite?.(stopId)}
                    onToggleExpanded={(stopId) => onToggleExpanded?.(stopId)}
                    onSelectRoute={onSelectRoute}
                  />
                ))}
              </div>
            ) : (
              <p className="stops-empty">
                {overviewLoading
                  ? 'Loading stops…'
                  : selectedList === 'favourites'
                  ? 'No favourite stops yet. Star a stop to save it here.'
                  : 'No stops available.'}
              </p>
            )}
          </div>
        ) : (
          <p>Tap a shuttle stop on the map to view its details and route actions.</p>
        )}
    </div>
  )
}
