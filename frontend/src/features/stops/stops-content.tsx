import { useLayoutEffect, useRef } from 'react'
import { SegmentedControl } from '../../ui/segmented-control.tsx'
import type { StopDetailsModel } from './data/stop-details-model.ts'
import type { StopListEntry } from './data/stop-list-data.ts'
import { StopDetails } from './components/stop-details.tsx'
import { StopList } from './components/stop-list.tsx'
import './styles/stops-content.css'

/**
 * Scrolls the nearest element above `element` that is actually scrolling back to its top.
 *
 * The list and the details share one content element, and on desktop the scroll owner is the panel
 * further up, not this element itself. A list scrolled far down would otherwise carry that offset
 * into the details, leaving their heading and Back control above the visible area of a short
 * column. Walking up beats naming the panel class, so this keeps working if that ownership moves.
 */
function resetScrollOwner(element: Element | null): void {
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      node.scrollTop = 0
      return
    }
  }
}

interface StopsContentProps {
  readonly selectedStop: StopDetailsModel | null
  readonly backLabel?: string
  readonly onBackToStops: () => void
  readonly onSelectOppositeStop: (stopId: string) => void
  readonly onSelectRoute: (routeId: string) => void
  readonly onNavigateToStop: (stopId: string) => void
  readonly stopListEntries?: readonly StopListEntry[]
  readonly stopListLoading?: boolean
  readonly selectedStopList?: 'nearby' | 'favourites'
  readonly selectedStopFavorite?: boolean
  readonly locationNotice?: string | null
  readonly noLiveData?: boolean
  readonly liveArrivalMessage?: string | null
  readonly isMobileViewport?: boolean
  readonly onSelectStopList: (list: 'nearby' | 'favourites') => void
  readonly onToggleFavorite: (stopId: string) => void
  readonly onToggleExpanded: (stopId: string) => void
  readonly onDismissLocationNotice: () => void
}

/**
 * The Stops pane's body: the Nearby/Favourites list, or one stop's details, sharing one content
 * element. Opening details on desktop resets the column to the top; mobile keeps the sheet's own
 * position, because there the sheet scrolls the card list rather than the column.
 */
export function StopsContent({
  selectedStop,
  backLabel,
  onBackToStops,
  onSelectOppositeStop,
  onSelectRoute,
  onNavigateToStop,
  stopListEntries,
  stopListLoading = false,
  selectedStopList = 'nearby',
  selectedStopFavorite = false,
  locationNotice = null,
  noLiveData = false,
  liveArrivalMessage = null,
  isMobileViewport = false,
  onSelectStopList,
  onToggleFavorite,
  onToggleExpanded,
  onDismissLocationNotice,
}: StopsContentProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const showingDetails = selectedStop !== null

  // Mobile keeps its own arrangement, where the details pane scrolls itself, so the reset is
  // confined to the desktop column that this feature's stylesheet makes the single scroller.
  useLayoutEffect(() => {
    if (!showingDetails || isMobileViewport) return
    resetScrollOwner(contentRef.current)
  }, [showingDetails, isMobileViewport, selectedStop?.id])

  return (
    <div className="stops-content">
      <div
        id="stops-content"
        ref={contentRef}
        className={`navigation-panel-content stops-content-panel${selectedStop ? ' navigation-panel-scroll-content' : ''}`}
        data-content-state={selectedStop ? 'stop-details' : 'stop-list'}
      >
        {selectedStop ? (
          <StopDetails
            stop={selectedStop}
            favorite={selectedStopFavorite}
            liveArrivalMessage={liveArrivalMessage}
            backLabel={backLabel}
            onBackToStops={onBackToStops}
            onSelectOppositeStop={onSelectOppositeStop}
            onSelectRoute={onSelectRoute}
            onNavigateToStop={onNavigateToStop}
            onToggleFavorite={onToggleFavorite}
          />
        ) : stopListEntries ? (
          <div className="stops-list-panel">
            <div className="stops-list-region stops-list-selector-region">
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
            </div>
            <StopList
              entries={stopListEntries}
              selectedStopList={selectedStopList}
              loading={stopListLoading}
              locationNotice={locationNotice}
              noLiveData={noLiveData}
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
