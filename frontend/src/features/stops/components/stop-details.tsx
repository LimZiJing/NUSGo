import { MobileMapDetailOverlay } from '../../../ui/mobile/mobile-map-detail-overlay'
import { GhostBackButton } from '../../../ui/ghost-back-button'
import { NavigateButton } from '../../../ui/navigate-button'
import { Button, IconButton } from '../../../ui/button'
import { BusIcon, ChevronRightIcon, FavoriteIcon } from '../../../ui/icons'
import type { StopDetailsModel } from '../data/stop-details-model'
import { StopDepartureList } from './stop-departure-list'
import '../styles/stop-details.css'

export function StopDetails({
  stop,
  favorite,
  liveArrivalMessage,
  onBackToStops,
  onSelectOppositeStop,
  onSelectRoute,
  onNavigateToStop,
  onToggleFavorite,
  mobileMapDetailOverlay = false,
}: {
  readonly stop: StopDetailsModel
  readonly favorite: boolean
  readonly liveArrivalMessage: string | null
  readonly onBackToStops: () => void
  readonly onSelectOppositeStop: (stopId: string) => void
  readonly onSelectRoute: (routeId: string) => void
  readonly onNavigateToStop: (stopId: string) => void
  readonly onToggleFavorite: (stopId: string) => void
  readonly mobileMapDetailOverlay?: boolean
}) {
  const oppositeStop = stop.oppositeStop
  const favoriteLabel = `${favorite ? 'Remove' : 'Add'} ${stop.longName}, bus stop ${favorite ? 'from' : 'to'} favourites`
  const favoriteButton = (
    <IconButton
      className="stop-favorite"
      variant="plain"
      label={favoriteLabel}
      icon={<FavoriteIcon filled={favorite} />}
      pressed={favorite}
      onClick={() => onToggleFavorite(stop.id)}
    />
  )

  if (mobileMapDetailOverlay) {
    return (
      <MobileMapDetailOverlay
        testId="stop-detail"
        label={`Stop details for ${stop.longName}`}
        backLabel="Back to stops"
        onBack={onBackToStops}
        identity={(
          <div className="mobile-detail-identity">
            <BusIcon className="location-identity-icon location-identity-icon--stop" />
            <div className="mobile-detail-identity-text">
              <h2
                id="stops-content-heading"
                className="mobile-detail-title"
                aria-label={`${stop.longName}, bus stop`}
                tabIndex={-1}
              >
                <span>{stop.longName}</span>
              </h2>
              <p className="mobile-detail-subtitle">{stop.id}</p>
            </div>
          </div>
        )}
        headerAction={(
          <NavigateButton
            ariaLabel="Navigate to this stop"
            onClick={() => onNavigateToStop(stop.id)}
          />
        )}
        bottomLabel="Bus departures"
        bottomHeading={(
          <div className="stop-detail-bottom-heading-row">
            <h4>
              <BusIcon />
              Bus departures
            </h4>
            <div className="stop-detail-bottom-actions">
              {oppositeStop && (
                <Button
                  className="stop-opposite"
                  variant="secondary"
                  label="Opp."
                  trailingIcon={<ChevronRightIcon />}
                  ariaLabel={`Opposite bus stop: ${oppositeStop.longName}, ${oppositeStop.id}`}
                  onClick={() => onSelectOppositeStop(oppositeStop.id)}
                />
              )}
              {favoriteButton}
            </div>
          </div>
        )}
        bottom={(
          <div className="stop-detail-map-departures">
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
                rowClassName="mobile-detail-card"
              />
            </div>
          </div>
        )}
      />
    )
  }

  return (
    <div className="stop-selection" data-testid="stop-detail">
      <GhostBackButton label="Back to stops" onClick={onBackToStops} />
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
        {favoriteButton}
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
