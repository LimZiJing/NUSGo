import { PublicServiceChip, RouteChip } from './route-chip'
import { FavoriteStarIcon } from './favorite-star-icon'

export interface BusStopFavoriteDestination {
  readonly id: string
  readonly name: string
  readonly isOpposite: boolean
}

export interface BusStopDeparture {
  readonly routeId: string
  readonly routeName: string
  readonly routeColor: string
  readonly timings: readonly [string, string, string]
  readonly reachableFavoriteStops?: readonly BusStopFavoriteDestination[]
}

export interface PublicServiceTiming {
  readonly serviceNumber: string
  readonly timings: readonly [string, string, string]
}

function DepartureTimes({ timings }: { readonly timings: readonly [string, string, string] }) {
  return (
    <span className="mobile-stop-departure-times">
      {timings.map((timing, index) => (
        <span
          key={index}
          className="mobile-stop-departure-time"
          data-timing-state={timing === 'Arr' || timing === 'Left' ? timing : undefined}
        >
          {timing}
        </span>
      ))}
    </span>
  )
}

export function BusStopTimings({
  departures,
  publicServices,
  onSelectRoute,
}: {
  readonly departures: readonly BusStopDeparture[]
  readonly publicServices: readonly PublicServiceTiming[]
  readonly onSelectRoute: (routeId: string) => void
}) {
  if (departures.length === 0 && publicServices.length === 0) {
    return <p>No bus timings available.</p>
  }

  return (
    <ul className="mobile-stop-departure-list" aria-label="Bus timings">
      {departures.map((departure) => (
        <li key={departure.routeId} className="mobile-stop-departure-row">
          <RouteChip
            routeId={departure.routeId}
            routeColor={departure.routeColor}
            ariaLabel={`View ${departure.routeId} route details`}
            title={departure.routeName}
            active
            size="compact"
            onClick={() => onSelectRoute(departure.routeId)}
          />
          {departure.reachableFavoriteStops?.length ? (
            <span
              className="mobile-stop-reachable-favorites"
              aria-label={`Reachable favourite stops: ${departure.reachableFavoriteStops.map(({ name }) => name).join(', ')}`}
            >
              <span className="mobile-stop-reachable-favorites-arrow" aria-hidden="true">→</span>
              {departure.reachableFavoriteStops.map(({ id, name, isOpposite }) => (
                <span
                  key={id}
                  className="mobile-stop-reachable-favorite"
                  data-opposite={isOpposite ? 'true' : undefined}
                >
                  <FavoriteStarIcon filled />
                  <span>{name}</span>
                </span>
              ))}
            </span>
          ) : null}
          <DepartureTimes timings={departure.timings} />
        </li>
      ))}
      {publicServices.map(({ serviceNumber, timings }) => (
        <li key={`public-${serviceNumber}`} className="mobile-stop-departure-row">
          <PublicServiceChip serviceNumber={serviceNumber} size="compact" />
          <DepartureTimes timings={timings} />
        </li>
      ))}
    </ul>
  )
}
