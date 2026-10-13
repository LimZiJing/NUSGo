import { GhostBackButton } from '../../../ui/ghost-back-button'
import { NavigateButton } from '../../../ui/navigate-button'
import { BusIcon, FavoriteIcon } from '../../../ui/icons'
import type { StopDetailsModel } from '../data/stop-details-model'
import { StopDepartureList } from './stop-departure-list'

export function StopDetails({
  stop,
  favorite,
  liveArrivalMessage,
  onBackToStops,
  onSelectOppositeStop,
  onSelectRoute,
  onNavigateToStop,
  onToggleFavorite,
}: {
  readonly stop: StopDetailsModel
  readonly favorite: boolean
  readonly liveArrivalMessage: string | null
  readonly onBackToStops: () => void
  readonly onSelectOppositeStop: (stopId: string) => void
  readonly onSelectRoute: (routeId: string) => void
  readonly onNavigateToStop: (stopId: string) => void
  readonly onToggleFavorite: (stopId: string) => void
}) {
  const oppositeStop = stop.oppositeStop

  return (
    <div className="stop-selection" data-testid="stop-detail">
      <GhostBackButton label="Back to stops" onClick={onBackToStops} />
      <div className="stop-identity">
        <div className="stop-identity-copy">
          <h2
            id="stops-content-heading"
            className="stop-selection-name"
            aria-label={`${stop.longName}, shuttle stop`}
          >
            <BusIcon className="location-identity-icon location-identity-icon--stop" />
            <span>{stop.longName}</span>
          </h2>
          <span className="stop-id">{stop.id}</span>
        </div>
        <button
          className="stop-favorite"
          type="button"
          aria-label={`${favorite ? 'Remove' : 'Add'} ${stop.longName}, shuttle stop ${favorite ? 'from' : 'to'} favourites`}
          aria-pressed={favorite}
          onClick={() => onToggleFavorite(stop.id)}
        >
          <FavoriteIcon filled={favorite} />
        </button>
      </div>
      <div className="stop-actions">
        <NavigateButton
          ariaLabel="Navigate to this stop"
          onClick={() => onNavigateToStop(stop.id)}
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
        <StopDepartureList
          departures={stop.departures}
          scheduledDepartures={stop.scheduledDepartures}
          liveArrivalMessage={stop.liveArrivalMessage}
          publicServices={stop.publicServices}
          onSelectRoute={onSelectRoute}
        />
      </div>
    </div>
  )
}
