import { useMemo } from 'react'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import { EMPTY_BUILDING_INDEX, type BuildingIndex } from '../../domain/venue/building-index'
import { linkVenuesToBuildings } from '../../domain/venue/building-links'
import type { TransitIndex } from '../../domain/transit'
import { GhostBackButton } from '../../ui/ghost-back-button.tsx'
import { SegmentedControl } from '../../ui/segmented-control.tsx'
import type { MobileSheetDetent } from '../../ui/mobile/mobile-sheet/mobile-sheet-detent.ts'
import type { ExplorePanelFocusBindings } from './hooks/use-explore-panel-focus.ts'
import type { ExploreMode, ExploreState } from './state/explore-state.ts'
import type { ExplorePanelStatus } from './state/explore-panel-status.ts'
import { BusRouteList } from './components/bus-route-list.tsx'
import { BuildingDetails, VenueDetails } from './components/venue-details.tsx'
import { VenueSearch } from './components/venue-search.tsx'
import './styles/explore-content.css'

const EXPLORE_LABELS = { venue: 'Find venue', busRoutes: 'Bus routes' } as const
const RETURN_LABELS: Readonly<Record<ExploreMode, string>> = {
  neutral: EXPLORE_LABELS.venue,
  'venue-search': EXPLORE_LABELS.venue,
  'venue-detail': 'Venue details',
  'bus-routes': EXPLORE_LABELS.busRoutes,
}

function getVenueDetailReturnLabel(state: ExploreState): string {
  return RETURN_LABELS[state.history.at(-1)?.mode ?? 'venue-search']
}

interface ExploreContentProps {
  state: ExploreState
  venues: VenueLocationMap | null
  buildings?: BuildingIndex | null
  transitIndex?: TransitIndex | null
  sheetDetent?: MobileSheetDetent
  onRestore?: () => void
  status?: ExplorePanelStatus | null
  selectedRouteId?: string | null
  onRouteSelect: (routeId: string) => void
  onQueryChange: (query: string) => void
  onNavigateToVenue?: (venueCode: string) => void
  onNavigateToBuilding?: (buildingId: string) => void
  onSearchFocus?: () => void
  focus: ExplorePanelFocusBindings
}

function getExplorePanelHeading(state: ExploreState): string {
  if (state.mode === 'bus-routes') return EXPLORE_LABELS.busRoutes
  if (state.mode === 'venue-detail') return 'Venue details'
  return 'Find a venue'
}

function getExplorePanelAnnouncement(state: ExploreState, buildingName?: string): string | null {
  if (state.mode === 'bus-routes') return null
  if (state.mode === 'venue-detail' && buildingName) return `Building details opened for ${buildingName}.`
  if (state.mode === 'venue-detail' && state.selectedVenue) {
    return `Venue details opened for ${state.selectedVenue.code}.`
  }
  if (state.mode === 'venue-search') return 'Venue search opened.'
  if (state.mode === 'neutral') return 'Venue search opened.'
  return 'Map context closed.'
}

// App supplies focus and navigation behavior; this component owns Explore's rendered structure.
export function ExploreContent({
  state,
  venues,
  buildings = null,
  transitIndex = null,
  sheetDetent = 'partial',
  onRestore,
  status,
  selectedRouteId = null,
  onRouteSelect,
  onQueryChange,
  onNavigateToVenue,
  onNavigateToBuilding,
  onSearchFocus,
  focus: {
    panelHeadingRef,
    searchInputRef,
    detailHeadingRef,
    firstRouteCardRef,
    onFocusCapture,
    onVenueSelect,
    onBuildingSelect,
    onBack,
    onSelectVenueSearch,
    onSelectBusRoutes,
    onFocusStop,
  },
}: ExploreContentProps) {
  const buildingIndex = buildings ?? EMPTY_BUILDING_INDEX
  const buildingLinks = useMemo(
    () => linkVenuesToBuildings(venues ?? {}, buildingIndex),
    [venues, buildingIndex],
  )
  const selectedBuilding = state.selectedBuildingId
    ? buildingIndex.byId.get(state.selectedBuildingId) ?? null
    : null
  const minimized = sheetDetent === 'collapsed'
  const explorePanelHeading = getExplorePanelHeading(state)
  const explorePanelAnnouncement = getExplorePanelAnnouncement(state, selectedBuilding?.name)
  const explorePanelStatus = status?.kind === 'success' ? null : status ?? null
  const showVenueSearch = state.mode === 'neutral' || state.mode === 'venue-search'
  const showExploreSegments = showVenueSearch || state.mode === 'bus-routes'
  const contentClassName = `explore-content explore-content-${state.mode}${
    showVenueSearch ? ' explore-content-venue-search' : ''
  }`

  return (
    <div className={contentClassName}>
      <div
        className="explore-content-focus-scope"
        onFocusCapture={onFocusCapture}
      >
        <div className="explore-content-header">
          {showExploreSegments && (
            <SegmentedControl
              className="explore-mode-selector"
              label="Explore mode"
              options={[
                { value: 'venue', label: EXPLORE_LABELS.venue, focusId: 'explore-venue-segment' },
                { value: 'bus-routes', label: EXPLORE_LABELS.busRoutes, focusId: 'explore-bus-routes-segment' },
              ]}
              value={showVenueSearch ? 'venue' : 'bus-routes'}
              onValueChange={(mode, event) => {
                if (mode === 'venue') onSelectVenueSearch()
                else onSelectBusRoutes(event)
              }}
            />
          )}
          {state.mode === 'venue-detail' && !minimized && (
            <GhostBackButton label={getVenueDetailReturnLabel(state)} onClick={onBack} />
          )}
          <h2
            id="explore-content-heading"
            ref={panelHeadingRef}
            tabIndex={-1}
            className={showExploreSegments || state.mode === 'venue-detail' ? 'visually-hidden' : undefined}
          >
            {explorePanelHeading}
          </h2>
        </div>

        {(state.mode === 'venue-search' || state.mode === 'neutral') && (
          <VenueSearch
            query={state.query}
            venues={venues}
            buildings={buildingIndex}
            buildingLinks={buildingLinks}
            minimized={minimized}
            inputRef={searchInputRef}
            onRestore={onRestore}
            onSearchFocus={onSearchFocus}
            onQueryChange={onQueryChange}
            onSelect={onVenueSelect}
            onBuildingSelect={onBuildingSelect}
          />
        )}

        {state.mode === 'venue-detail' && state.selectedVenue && (
          <VenueDetails
            venue={state.selectedVenue}
            transitIndex={transitIndex}
            headingRef={detailHeadingRef}
            onNavigateToVenue={onNavigateToVenue}
            onFocusStop={onFocusStop}
          />
        )}

        {state.mode === 'venue-detail' && !state.selectedVenue && selectedBuilding && (
          <BuildingDetails
            building={selectedBuilding}
            roomCount={buildingLinks.roomCountByBuildingId.get(selectedBuilding.id) ?? 0}
            transitIndex={transitIndex}
            headingRef={detailHeadingRef}
            onNavigateToBuilding={onNavigateToBuilding}
            onFocusStop={onFocusStop}
          />
        )}

        {state.mode === 'bus-routes' && (
          <div
            id="explore-content-panel"
            className="navigation-panel-content explore-content-panel"
          >
            <BusRouteList
              network={transitIndex?.network ?? null}
              networkIndex={transitIndex}
              selectedRouteId={selectedRouteId}
              onRouteSelect={onRouteSelect}
              firstRouteCardRef={firstRouteCardRef}
              onFocusStop={onFocusStop}
            />
          </div>
        )}
        {explorePanelStatus && (
          <p
            className={`navigation-panel-content explore-content-status explore-content-status-${explorePanelStatus.kind}`}
            role="status"
            aria-live={explorePanelStatus.kind === 'failure' ? 'assertive' : 'polite'}
            aria-atomic="true"
          >
            {explorePanelStatus.message}
          </p>
        )}
        {minimized && explorePanelStatus?.kind === 'failure' && (
          <span
            className="explore-content-failure-indicator"
            role="img"
            aria-label={`Map data unavailable: ${explorePanelStatus.message}`}
          >
            !
          </span>
        )}
        {explorePanelAnnouncement && (
          <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {explorePanelAnnouncement}
          </p>
        )}
      </div>
    </div>
  )
}
