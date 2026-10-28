import { Button, IconButton } from '../../../ui/button'
import { CloseIcon, FavoriteIcon } from '../../../ui/icons'
import type { StopListEntry } from '../data/stop-list-data'
import { StopCard } from './stop-card'

export function StopList({
  entries,
  selectedStopList,
  loading,
  locationNotice,
  noLiveData,
  liveArrivalMessage,
  onSelectStopList,
  onToggleFavorite,
  onToggleExpanded,
  onSelectRoute,
  onDismissLocationNotice,
}: {
  readonly entries: readonly StopListEntry[]
  readonly selectedStopList: 'nearby' | 'favourites'
  readonly loading: boolean
  readonly locationNotice: string | null
  readonly noLiveData: boolean
  readonly liveArrivalMessage: string | null
  readonly onSelectStopList: (list: 'nearby' | 'favourites') => void
  readonly onToggleFavorite: (stopId: string) => void
  readonly onToggleExpanded: (stopId: string) => void
  readonly onSelectRoute: (routeId: string) => void
  readonly onDismissLocationNotice: () => void
}) {
  return (
    <>
      {liveArrivalMessage && (
        <p className="stop-live-arrival-message" role="status">
          {liveArrivalMessage}
        </p>
      )}
      {locationNotice && selectedStopList === 'nearby' && (
        <div className="stops-location-notice" role="status">
          <span>{locationNotice}</span>
          <IconButton
            variant="plain"
            label="Dismiss location notice"
            icon={<CloseIcon />}
            onClick={onDismissLocationNotice}
          />
        </div>
      )}
      {entries.length ? (
        <div className="stops-list-region navigation-panel-scroll-content stops-card-list">
          {entries.map(({ stop, distanceMeters, favorite, expanded }) => (
            <StopCard
              key={stop.id}
              stopId={stop.id}
              stopName={stop.longName}
              distanceMeters={distanceMeters}
              favorite={favorite}
              expanded={expanded}
              noLiveData={noLiveData}
              live={stop.live}
              pollState={stop.pollState}
              liveArrivalMessage={stop.liveArrivalMessage}
              departures={stop.departures}
              scheduledDepartures={stop.scheduledDepartures}
              publicServices={stop.publicServices}
              onToggleFavorite={onToggleFavorite}
              onToggleExpanded={onToggleExpanded}
              onSelectRoute={onSelectRoute}
            />
          ))}
        </div>
      ) : selectedStopList === 'favourites' && !loading ? (
        <div className="stops-empty stops-list-region navigation-panel-scroll-content stops-empty--favourites">
          <FavoriteIcon filled={false} className="stops-empty-icon" />
          <p>No favourites? Use the Star icon to favourite stops.</p>
          <Button
            variant="secondary"
            label="Browse stops"
            onClick={() => onSelectStopList('nearby')}
          />
        </div>
      ) : (
        <p className="stops-empty stops-list-region">
          {loading ? 'Loading stops…' : 'No stops available.'}
        </p>
      )}
    </>
  )
}
