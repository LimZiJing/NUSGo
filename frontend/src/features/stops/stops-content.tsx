import { SegmentedControl } from '../../ui/segmented-control.tsx'
import type { StopDetailsModel } from './data/stop-details-model.ts'
import type { StopListEntry } from './data/stop-list-data.ts'
import { StopDetails } from './components/stop-details.tsx'
import { StopList } from './components/stop-list.tsx'
import './styles/stops-content.css'

interface StopsContentProps {
  readonly selectedStop: StopDetailsModel | null
  readonly mobileMapDetailOverlay?: boolean
  readonly onBackToStops: () => void
  readonly onSelectOppositeStop: (stopId: string) => void
  readonly onSelectRoute: (routeId: string) => void
  readonly onNavigateToStop: (stopId: string) => void
  readonly stopListEntries?: readonly StopListEntry[]
  readonly stopListLoading?: boolean
  readonly selectedStopList?: 'nearby' | 'favourites'
  readonly selectedStopFavorite?: boolean
  readonly locationNotice?: string | null
  readonly liveArrivalMessage?: string | null
  readonly onSelectStopList: (list: 'nearby' | 'favourites') => void
  readonly onToggleFavorite: (stopId: string) => void
  readonly onToggleExpanded: (stopId: string) => void
  readonly onDismissLocationNotice: () => void
}

export function StopsContent({
  selectedStop,
  mobileMapDetailOverlay = false,
  onBackToStops,
  onSelectOppositeStop,
  onSelectRoute,
  onNavigateToStop,
  stopListEntries,
  stopListLoading = false,
  selectedStopList = 'nearby',
  selectedStopFavorite = false,
  locationNotice = null,
  liveArrivalMessage = null,
  onSelectStopList,
  onToggleFavorite,
  onToggleExpanded,
  onDismissLocationNotice,
}: StopsContentProps) {
  return (
    <div className={`stops-content${mobileMapDetailOverlay ? ' stops-content-map-detail' : ''}`}>
      <div
        id="stops-content"
        className={`navigation-panel-content stops-content-panel${selectedStop ? ' navigation-panel-scroll-content' : ''}${mobileMapDetailOverlay ? ' stops-content-panel-map-detail' : ''}`}
        data-content-state={selectedStop ? 'stop-details' : 'stop-list'}
      >
        {selectedStop ? (
          <StopDetails
            stop={selectedStop}
            favorite={selectedStopFavorite}
            liveArrivalMessage={liveArrivalMessage}
            mobileMapDetailOverlay={mobileMapDetailOverlay}
            onBackToStops={onBackToStops}
            onSelectOppositeStop={onSelectOppositeStop}
            onSelectRoute={onSelectRoute}
            onNavigateToStop={onNavigateToStop}
            onToggleFavorite={onToggleFavorite}
          />
        ) : stopListEntries ? (
          <div className="stops-list-panel">
            <SegmentedControl
              className="stops-list-selector"
              label="Stop list"
              options={[
                { value: 'nearby', label: 'Nearby' },
                { value: 'favourites', label: 'Favourites' },
              ]}
              value={selectedStopList}
              onValueChange={onSelectStopList}
            />
            <StopList
              entries={stopListEntries}
              selectedStopList={selectedStopList}
              loading={stopListLoading}
              locationNotice={locationNotice}
              liveArrivalMessage={liveArrivalMessage}
              onSelectStopList={onSelectStopList}
              onToggleFavorite={onToggleFavorite}
              onToggleExpanded={onToggleExpanded}
              onSelectRoute={onSelectRoute}
              onDismissLocationNotice={onDismissLocationNotice}
            />
          </div>
        ) : (
          <p>Tap a bus stop on the map to view its details and route actions.</p>
        )}
      </div>
    </div>
  )
}
