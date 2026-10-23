import { GhostBackButton } from '../../../ui/ghost-back-button'
import { NavigateButton } from '../../../ui/navigate-button'
import { Button, IconButton } from '../../../ui/button'
import { BusIcon, ChevronRightIcon, FavoriteIcon } from '../../../ui/icons'
import type { StopDetailsModel } from '../data/stop-details-model'
import { StopDepartureList } from './stop-departure-list'

export function StopDetails({
  stop,
  favorite,
  liveArrivalMessage,
  backLabel = 'Back to stops',
  onBackToStops,
  onSelectOppositeStop,
  onSelectRoute,
  onNavigateToStop,
  onToggleFavorite,
}: {
  readonly stop: StopDetailsModel
  readonly favorite: boolean
  readonly liveArrivalMessage: string | null
  readonly backLabel?: string
  readonly onBackToStops: () => void
  readonly onSelectOppositeStop: (stopId: string) => void
  readonly onSelectRoute: (routeId: string) => void
  readonly onNavigateToStop: (stopId: string) => void
  readonly onToggleFavorite: (stopId: string) => void
}) {
  const oppositeStop = stop.oppositeStop

  return (
    <div className="stop-selection" data-testid="stop-detail">
      <GhostBackButton label={backLabel} onClick={onBackToStops} />
      <div className="stop-identity">
        <div className="stop-identity-copy">
          <h2
            id="stops-content-heading"
            className="stop-selection-name"
            aria-label={`${stop.longName}, bus stop`}
          >
            <BusIcon className="location-identity-icon location-identity-icon--stop" />
            <span>{stop.longName}</span>
          </h2>
          <span className="stop-id">{stop.id}</span>
        </div>
        <IconButton
          className="stop-favorite"
          variant="plain"
          label={`${favorite ? 'Remove' : 'Add'} ${stop.longName}, bus stop ${favorite ? 'from' : 'to'} favourites`}
          icon={<FavoriteIcon filled={favorite} />}
          pressed={favorite}
          onClick={() => onToggleFavorite(stop.id)}
        />
      </div>
      <div className="stop-actions">
        <NavigateButton
          ariaLabel="Navigate to this stop"
          onClick={() => onNavigateToStop(stop.id)}
        />
        {oppositeStop ? (
          <Button
            className="stop-opposite"
            variant="secondary"
            label="Opposite stop"
            trailingIcon={<ChevronRightIcon />}
            ariaLabel={`Opposite bus stop: ${oppositeStop.longName}, ${oppositeStop.id}`}
            onClick={() => onSelectOppositeStop(oppositeStop.id)}
          />
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
