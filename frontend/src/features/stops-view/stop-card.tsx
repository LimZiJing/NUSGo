import {
  StopTimings,
  type StopDeparture,
  type StopScheduledDeparture,
  type PublicServiceTiming,
} from './stop-timings'
import { InfoPill } from '../../ui/info-pill'
import { ChevronDownIcon, FavoriteIcon } from '../../ui/icons'

export interface StopCardProps {
  readonly stopId: string
  readonly stopName: string
  readonly distanceMeters: number | null
  readonly favorite: boolean
  readonly expanded: boolean
  readonly live?: boolean
  readonly liveArrivalMessage?: string | null
  readonly departures: readonly StopDeparture[]
  readonly scheduledDepartures?: readonly StopScheduledDeparture[]
  readonly publicServices: readonly PublicServiceTiming[]
  readonly onToggleFavorite: (stopId: string) => void
  readonly onToggleExpanded: (stopId: string) => void
  readonly onSelectRoute: (routeId: string) => void
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters >= 1_000) return `${(distanceMeters / 1_000).toFixed(1)}km`
  return `${Math.round(distanceMeters / 10) * 10}m`
}

export function StopCard({
  stopId,
  stopName,
  distanceMeters,
  favorite,
  expanded,
  live = false,
  liveArrivalMessage = null,
  departures,
  scheduledDepartures = [],
  publicServices,
  onToggleFavorite,
  onToggleExpanded,
  onSelectRoute,
}: StopCardProps) {
  const timingsId = `stop-card-timings-${stopId}`
  return (
    <article className="stop-card">
      <div className="stop-card-header">
        <button
          className="stop-card-toggle"
          type="button"
          data-hover-filter="none"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${stopName} bus timings`}
          aria-expanded={expanded}
          aria-controls={timingsId}
          onClick={() => onToggleExpanded(stopId)}
        >
          <span className="stop-card-identity">
            <span className="stop-card-name">{stopName}</span>
            {distanceMeters !== null && (
              <InfoPill text={formatDistance(distanceMeters)} colorScheme="neutral" />
            )}
          </span>
          {expanded && live && (
            <InfoPill text="LIVE" colorScheme="success" className="stop-card-live" leadingDot />
          )}
          <span className="stop-card-favorite-space" aria-hidden="true" />
          <ChevronDownIcon />
        </button>
        <button
          className="stop-card-favorite"
          type="button"
          aria-label={`${favorite ? 'Remove' : 'Add'} ${stopName} ${favorite ? 'from' : 'to'} favourites`}
          aria-pressed={favorite}
          onClick={() => onToggleFavorite(stopId)}
        >
          <FavoriteIcon filled={favorite} />
        </button>
      </div>
      <div
        id={timingsId}
        className="stop-card-timings"
        data-expanded={expanded}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="stop-card-timings-inner">
          <StopTimings
            departures={departures}
            scheduledDepartures={scheduledDepartures}
            liveArrivalMessage={liveArrivalMessage}
            publicServices={publicServices}
            onSelectRoute={onSelectRoute}
          />
        </div>
      </div>
    </article>
  )
}
