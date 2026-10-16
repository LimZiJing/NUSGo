import { GroupedList } from '../../../ui/grouped-list'
import { PublicServiceChip, RouteChip } from '../../../ui/route-chip'
import type {
  PublicServiceTiming,
  StopDeparture,
  StopScheduledDeparture,
} from '../data/stop-timing-data'
import { ReachableFavouriteStops } from './reachable-favourite-stops'

function DepartureTimes({ timings }: { readonly timings: readonly [string, string, string] }) {
  return (
    <span className="stop-departure-times">
      {timings.map((timing, index) => (
        <span
          key={index}
          className="stop-departure-time"
          data-timing-state={timing === 'Arr' || timing === 'Left' ? timing : undefined}
        >
          {timing}
        </span>
      ))}
    </span>
  )
}

function publicTimingMessage(status: PublicServiceTiming['status']): string {
  switch (status) {
    case 'not-in-operation':
      return 'Not in operation'
    case 'provider-error':
      return 'Live timing unavailable'
    case 'no-estimate':
      return 'No estimate available'
    default:
      return 'No live timing'
  }
}

export function StopDepartureList({
  departures,
  scheduledDepartures = [],
  liveArrivalMessage = null,
  publicServices,
  onSelectRoute,
}: {
  readonly departures: readonly StopDeparture[]
  readonly scheduledDepartures?: readonly StopScheduledDeparture[]
  readonly liveArrivalMessage?: string | null
  readonly publicServices: readonly PublicServiceTiming[]
  readonly onSelectRoute: (routeId: string) => void
}) {
  if (departures.length === 0 && scheduledDepartures.length === 0 && publicServices.length === 0) {
    return <p className="stop-departure-list-empty">{liveArrivalMessage ?? 'No bus timings available.'}</p>
  }

  return (
    <>
      {liveArrivalMessage && (
        <p className="stop-live-arrival-message" role="status">
          {liveArrivalMessage}
        </p>
      )}
      <GroupedList ariaLabel="Bus timings" className="stop-departure-list">
        {departures.map((departure) => (
          <li key={departure.routeId} className="stop-departure-row">
            <RouteChip
              routeId={departure.routeId}
              routeColor={departure.routeColor}
              ariaLabel={`View ${departure.routeId} route details`}
              title={departure.routeName}
              active
              size="compact"
              onClick={() => onSelectRoute(departure.routeId)}
            />
            <ReachableFavouriteStops stops={departure.reachableFavouriteStops ?? []} />
            <DepartureTimes timings={departure.timings} />
          </li>
        ))}
        {scheduledDepartures.map(({ routeId, routeName, routeColor, message }) => (
          <li key={`scheduled-${routeId}`} className="stop-departure-row">
            <RouteChip
              routeId={routeId}
              routeColor={routeColor}
              ariaLabel={`View ${routeId} route details`}
              title={routeName}
              active
              size="compact"
              onClick={() => onSelectRoute(routeId)}
            />
            <span className="stop-departure-status">{message}</span>
          </li>
        ))}
        {publicServices.map(({ serviceNumber, timings, status }) => (
          <li key={`public-${serviceNumber}`} className="stop-departure-row">
            <PublicServiceChip serviceNumber={serviceNumber} size="compact" />
            {timings ? <DepartureTimes timings={timings} /> : (
              <span className="stop-departure-status">{publicTimingMessage(status)}</span>
            )}
          </li>
        ))}
      </GroupedList>
    </>
  )
}
