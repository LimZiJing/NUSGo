import { GhostBackButton } from '../../ui/ghost-back-button'
import { NavigateButton } from '../../ui/navigate-button'
import {
  StopTimings,
  type StopDeparture,
  type StopScheduledDeparture,
  type PublicServiceTiming,
} from './stop-timings'
import { StopCard } from './stop-card'
import { BusIcon, FavoriteIcon } from '../../ui/icons'
import { SegmentedControl } from '../../ui/segmented-control'
import { type StopRouteDeparture } from './stops-view-state'
import './styles/stops-view.css'

type StopSheetDeparture = StopRouteDeparture & StopDeparture

export interface StopSheetSelection {
  readonly id: string
  readonly longName: string
  readonly oppositeStop: { readonly id: string; readonly longName: string } | null
  readonly publicServices: readonly PublicServiceTiming[]
  readonly departures: readonly StopSheetDeparture[]
  readonly scheduledDepartures: readonly StopScheduledDeparture[]
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

  return (
    <div className="stops-view">
      <div
        id="stops-view-content"
        className={`navigation-panel-content stops-view-content${selectedStop ? ' navigation-panel-scroll-content' : ''}`}
        data-view={selectedStop ? 'selected' : 'overview'}
      >
        {selectedStop ? (
          <div className="stop-selection" data-testid="stop-detail">
            <GhostBackButton label="Back to stops" onClick={onBackToStops} />
            <div className="stop-identity">
              <div className="stop-identity-copy">
                <h2
                  id="stops-view-heading"
                  className="stop-selection-name"
                  aria-label={`${selectedStop.longName}, shuttle stop`}
                >
                  <BusIcon className="location-identity-icon location-identity-icon--stop" />
                  <span>{selectedStop.longName}</span>
                </h2>
                <span className="stop-id">{selectedStop.id}</span>
              </div>
              <button
                className="stop-favorite"
                type="button"
                aria-label={`${selectedStopFavorite ? 'Remove' : 'Add'} ${selectedStop.longName}, shuttle stop ${selectedStopFavorite ? 'from' : 'to'} favourites`}
                aria-pressed={selectedStopFavorite}
                onClick={() => onToggleFavorite?.(selectedStop.id)}
              >
                <FavoriteIcon filled={selectedStopFavorite} />
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
                  aria-label={`Opposite shuttle stop: ${oppositeStop.longName}, ${oppositeStop.id}`}
                  title={`Opposite shuttle stop: ${oppositeStop.longName} (${oppositeStop.id})`}
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
              <StopTimings
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
            <SegmentedControl
              className="stops-list-selector"
              label="Stop list"
              options={[
                { value: 'nearby', label: 'Nearby' },
                { value: 'favourites', label: 'Favourites' },
              ]}
              value={selectedList}
              onValueChange={(list) => onSelectList?.(list)}
            />
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
              <div className="navigation-panel-scroll-content stops-card-list">
                {overviewStops.map(({ stop, distanceMeters, favorite, expanded }) => (
                  <StopCard
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
            ) : selectedList === 'favourites' && !overviewLoading ? (
              <div className="stops-empty stops-empty--favourites">
                <FavoriteIcon filled={false} className="stops-empty-icon" />
                <p>No favourites? Use the Star icon to favourite stops.</p>
                <button
                  type="button"
                  className="stops-empty-action"
                  onClick={() => onSelectList?.('nearby')}
                >
                  Browse stops
                </button>
              </div>
            ) : (
              <p className="stops-empty">
                {overviewLoading ? 'Loading stops…' : 'No stops available.'}
              </p>
            )}
          </div>
        ) : (
          <p>Tap a shuttle stop on the map to view its details and route actions.</p>
        )}
      </div>
    </div>
  )
}
