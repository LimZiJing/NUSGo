import { BusStopTimings, type BusStopDeparture, type PublicServiceTiming } from './bus-stop-timings'
import { FavoriteStarIcon } from './favorite-star-icon'
import { InfoPill } from './info-pill'

export interface BusStopCardProps {
  readonly stopId: string
  readonly stopName: string
  readonly distanceMeters: number | null
  readonly favorite: boolean
  readonly expanded: boolean
  readonly departures: readonly BusStopDeparture[]
  readonly publicServices: readonly PublicServiceTiming[]
  readonly onToggleFavorite: (stopId: string) => void
  readonly onToggleExpanded: (stopId: string) => void
  readonly onSelectRoute: (routeId: string) => void
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters >= 1_000) return `${(distanceMeters / 1_000).toFixed(1)}km`
  return `${Math.round(distanceMeters / 10) * 10}m`
}

export function BusStopCard({
  stopId,
  stopName,
  distanceMeters,
  favorite,
  expanded,
  departures,
  publicServices,
  onToggleFavorite,
  onToggleExpanded,
  onSelectRoute,
}: BusStopCardProps) {
  const timingsId = `bus-stop-card-timings-${stopId}`
  return (
    <article className="bus-stop-card">
      <div className="bus-stop-card-header">
        <button
          className="bus-stop-card-toggle"
          type="button"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${stopName} bus timings`}
          aria-expanded={expanded}
          aria-controls={timingsId}
          onClick={() => onToggleExpanded(stopId)}
        >
          <span className="bus-stop-card-identity">
            <span className="bus-stop-card-name">{stopName}</span>
            {distanceMeters !== null && (
              <InfoPill text={formatDistance(distanceMeters)} colorScheme="neutral" />
            )}
          </span>
          {expanded && (
            <InfoPill text="LIVE" colorScheme="success" className="bus-stop-card-live" leadingDot />
          )}
          <span className="bus-stop-card-favorite-space" aria-hidden="true" />
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none">
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          className="bus-stop-card-favorite"
          type="button"
          aria-label={`${favorite ? 'Remove' : 'Add'} ${stopName} ${favorite ? 'from' : 'to'} favourites`}
          aria-pressed={favorite}
          onClick={() => onToggleFavorite(stopId)}
        >
          <FavoriteStarIcon filled={favorite} />
        </button>
      </div>
      <div
        id={timingsId}
        className="bus-stop-card-timings"
        data-expanded={expanded}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="bus-stop-card-timings-inner">
          <BusStopTimings
            departures={departures}
            publicServices={publicServices}
            onSelectRoute={onSelectRoute}
          />
        </div>
      </div>
    </article>
  )
}
