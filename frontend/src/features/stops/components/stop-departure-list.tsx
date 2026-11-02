import type { ReactNode } from 'react'
import { PublicServiceChip, RouteChip } from '../../../ui/route-chip'
import type {
  PublicServiceTiming,
  StopDeparture,
  StopScheduledDeparture,
} from '../data/stop-timing-data'
import { ReachableFavouriteStops } from './reachable-favourite-stops'

function timingAccessibleLabel(timing: string): string {
  if (timing === 'Arr') return 'Arriving now'
  if (timing === 'Left') return 'Bus has left'
  const minutes = /^(\d+)(?:m|′| min)$/.exec(timing)?.[1]
  return minutes === undefined ? timing : `${minutes} ${minutes === '1' ? 'minute' : 'minutes'}`
}

function departureStatusAccessibleLabel(message: string): string {
  const minutes = /^First bus in (\d+)(?:m|′| min)$/.exec(message)?.[1]
  return minutes === undefined
    ? message
    : `First bus in ${minutes} ${minutes === '1' ? 'minute' : 'minutes'}`
}

function AccessibleTiming({ visual, spoken }: { readonly visual: ReactNode; readonly spoken: string }) {
  if (typeof visual === 'string' && visual === spoken) return visual
  return (
    <>
      <span aria-hidden="true">{visual}</span>
      <span className="visually-hidden">{spoken}</span>
    </>
  )
}

function formatTimingVisual(timing: string): ReactNode {
  const minutes = /^(\d+) min$/.exec(timing)
  if (!minutes) return timing

  return (
    <span className="stop-departure-time-min">
      <span>{minutes[1]}</span>
      <span>min</span>
    </span>
  )
}

function DepartureTimes({ timings }: { readonly timings: readonly [string, string, string] }) {
  return (
    <span className="stop-departure-times">
      {timings.map((timing, index) => (
        <span
          key={index}
          className="stop-departure-time"
          data-timing-state={timing === 'Arr' || timing === 'Left' ? timing : undefined}
        >
          <AccessibleTiming visual={formatTimingVisual(timing)} spoken={timingAccessibleLabel(timing)} />
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
  noLiveData = false,
  liveArrivalMessage = null,
  publicServices,
  onSelectRoute,
}: {
  readonly departures: readonly StopDeparture[]
  readonly scheduledDepartures?: readonly StopScheduledDeparture[]
  readonly noLiveData?: boolean
  readonly liveArrivalMessage?: string | null
  readonly publicServices: readonly PublicServiceTiming[]
  readonly onSelectRoute: (routeId: string) => void
}) {
  const visiblePublicServices = noLiveData
    ? publicServices.filter(({ timings }) => timings !== null)
    : publicServices

  if (departures.length === 0 && scheduledDepartures.length === 0 && visiblePublicServices.length === 0) {
    if (noLiveData) return null
    return <p className="stop-departure-list-empty">{liveArrivalMessage ?? 'No bus timings available.'}</p>
  }

  return (
    <>
      {!noLiveData && liveArrivalMessage && (
        <p className="stop-live-arrival-message" role="status">
          {liveArrivalMessage}
        </p>
      )}
      <ul className="stop-departure-list" aria-label="Bus timings">
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
            <span className="stop-departure-status">
              <AccessibleTiming visual={message} spoken={departureStatusAccessibleLabel(message)} />
            </span>
          </li>
        ))}
        {visiblePublicServices.map(({ serviceNumber, timings, status, startMessage }) => (
          <li key={`public-${serviceNumber}`} className="stop-departure-row">
            <PublicServiceChip serviceNumber={serviceNumber} size="compact" />
            {timings ? <DepartureTimes timings={timings} /> : (
              <span className="stop-departure-status">{startMessage ?? publicTimingMessage(status)}</span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
