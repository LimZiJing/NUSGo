import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type MouseEvent,
  type RefObject,
  type ReactNode,
} from 'react'
import type { VenueSearchResult } from '../../domain/venue/search'
import { searchExplore, type ExploreSearchResult } from '../../domain/venue/explore-search'
import { EMPTY_BUILDING_INDEX, type BuildingIndex } from '../../domain/venue/building-index'
import { linkVenuesToBuildings } from '../../domain/venue/building-links'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import {
  formatVenueFloorAndBuilding,
  getVenueBuildingName,
  hasVenueCoordinates,
} from '../../domain/venue/details'
import { findNearbyShuttleStops, type TransitIndex } from '../../domain/transit'
import nusmodsLogoUrl from '../../ui/brand-assets/nusmods-logo.svg'
import { IconButton } from '../../ui/button'
import { GhostBackButton } from '../../ui/ghost-back-button'
import { NavigateButton } from '../../ui/navigate-button'
import { ScrollArea } from '../../ui/scroll-area'
import { SearchField } from '../../ui/search-field'
import { SegmentedControl } from '../../ui/segmented-control'
import { getRouteContrastTextColor } from '../../domain/transit/route-color'
import {
  BuildingIcon,
  BusIcon,
  ChevronRightIcon,
  CloseIcon,
  SearchIcon,
} from '../../ui/icons'
import type { MobileSheetDetent } from '../../ui/mobile/mobile-sheet/mobile-sheet-detent'
import type { ExploreViewMode, ExploreViewState } from './state'
import type { PanelStatus } from './status'
import { getExploreShellClassName } from './explore-view-shell'
import './styles/explore-view.css'

interface FocusTarget {
  readonly element: HTMLElement | null
  readonly key: string | null
  readonly fallbackKey: string | null
}
interface ShuttleRouteRenderOptions {
  readonly firstRouteCardRef: RefObject<HTMLButtonElement | null>
  readonly onFocusStop: (stopId: string, focusTarget?: HTMLElement) => void
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
const EXPLORE_LABELS = { venue: 'Find venue', shuttle: 'Shuttle routes' } as const
const RETURN_LABELS: Readonly<Record<ExploreViewMode, string>> = {
  neutral: EXPLORE_LABELS.venue,
  'venue-search': EXPLORE_LABELS.venue,
  'venue-detail': 'Venue details',
  shuttle: EXPLORE_LABELS.shuttle,
}

function getVenueDetailReturnLabel(state: ExploreViewState): string {
  return RETURN_LABELS[state.history.at(-1)?.mode ?? 'venue-search']
}

interface ExploreViewProps {
  state: ExploreViewState
  venues: VenueLocationMap | null
  buildings?: BuildingIndex | null
  transitIndex?: TransitIndex | null
  shuttleRoutesAvailable: boolean
  renderShuttleRoutes: (options: ShuttleRouteRenderOptions) => ReactNode
  sheetDetent?: MobileSheetDetent
  mobileSheet?: boolean
  active?: boolean
  onRestore?: () => void
  onMinimize?: () => void
  status?: PanelStatus | null
  selectedRouteId?: string | null
  onQueryChange: (query: string) => void
  onVenueSelect: (result: VenueSearchResult) => void
  onBuildingSelect?: (buildingId: string) => void
  onNavigateToBuilding?: (buildingId: string) => void
  onNavigateToVenue?: (venueCode: string) => void
  onOpenShuttle: () => void
  onLeaveMobileRoutes?: () => void
  onFocusStop?: (stopId: string, focusTarget?: HTMLElement) => void
  onBack: () => void
  onEscape: () => void
  onDismissMapPopup?: () => boolean
  onSearchFocus?: () => void
  onSearchCancel?: () => void
  onSearchResult?: () => void
}

function getPanelHeading(state: ExploreViewState): string {
  if (state.mode === 'shuttle') return 'Shuttle routes'
  if (state.mode === 'venue-detail') return 'Venue details'
  if (state.mode === 'venue-search') return 'Find a venue'
  return 'Find a venue'
}

function findFocusTarget(key: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-focus-id]'))
    .find((element) => element.dataset.focusId === key)
}

function getPanelAnnouncement(state: ExploreViewState, buildingName?: string): string | null {
  if (state.mode === 'shuttle') return null
  if (state.mode === 'venue-detail' && buildingName) return `Building details opened for ${buildingName}.`
  if (state.mode === 'venue-detail' && state.selectedVenue) {
    return `Venue details opened for ${state.selectedVenue.code}.`
  }
  if (state.mode === 'venue-search') return 'Venue search opened.'
  if (state.mode === 'neutral') return 'Venue search opened.'
  return 'Map context closed.'
}

function getVisiblePanelStatus(
  status: PanelStatus | null | undefined,
): PanelStatus | null {
  if (!status || status.kind === 'success') return null
  return status
}

export function ExploreView({
  state,
  venues,
  buildings = null,
  transitIndex = null,
  shuttleRoutesAvailable,
  renderShuttleRoutes,
  sheetDetent = 'partial',
  mobileSheet = true,
  active = true,
  onRestore,
  onMinimize,
  status,
  selectedRouteId = null,
  onQueryChange,
  onVenueSelect,
  onBuildingSelect,
  onNavigateToBuilding,
  onNavigateToVenue,
  onOpenShuttle,
  onLeaveMobileRoutes,
  onFocusStop,
  onBack,
  onEscape,
  onDismissMapPopup,
  onSearchFocus,
  onSearchCancel,
  onSearchResult,
}: ExploreViewProps) {
  const minimized = sheetDetent === 'collapsed'
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const detailHeadingRef = useRef<HTMLHeadingElement>(null)
  const firstRouteCardRef = useRef<HTMLButtonElement>(null)
  const focusHistoryRef = useRef<FocusTarget[]>([])
  const pendingFocusRef = useRef<FocusTarget | null>(null)
  const previousModeRef = useRef<ExploreViewState['mode'] | null>(null)
  const previousMinimizedRef = useRef(minimized)
  const previousMobileSheetRef = useRef(mobileSheet)
  const previousActiveRef = useRef(active)
  const panelFocusRef = useRef(false)
  const shuttleRouteFocusPendingRef = useRef(false)
  const shuttleFocusMovedRef = useRef(false)
  const programmaticFocusRef = useRef(false)
  const pendingStopRowFocusRef = useRef<HTMLElement | null>(null)

  const focusElement = (element: HTMLElement | null): void => {
    if (!element) return
    programmaticFocusRef.current = true
    element.focus()
    programmaticFocusRef.current = false
  }

  const handlePanelFocusCapture = (): void => {
    panelFocusRef.current = true
    if (
      state.mode === 'shuttle' &&
      shuttleRouteFocusPendingRef.current &&
      !programmaticFocusRef.current
    ) {
      shuttleRouteFocusPendingRef.current = false
      shuttleFocusMovedRef.current = true
    }
  }

  const rememberPanelBackFocus = useCallback((): void => {
    pendingFocusRef.current = focusHistoryRef.current.pop() ?? null
  }, [])

  const handlePanelBlurCapture = (event: FocusEvent<HTMLElement>): void => {
    const relatedTarget = event.relatedTarget
    if (relatedTarget && !event.currentTarget.contains(relatedTarget)) {
      panelFocusRef.current = false
    }
  }

  const routesAvailable = shuttleRoutesAvailable

  useEffect(() => {
    if (!active) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (onDismissMapPopup?.()) {
        event.preventDefault()
        focusElement(pendingStopRowFocusRef.current)
        pendingStopRowFocusRef.current = null
        return
      }
      if (minimized) return
      event.preventDefault()
      if (state.mode === 'shuttle') {
        focusHistoryRef.current = []
        pendingStopRowFocusRef.current = null
        pendingFocusRef.current = {
          element: null,
          key: 'explore-venue-segment',
          fallbackKey: null,
        }
        onLeaveMobileRoutes?.()
        return
      }
      if (state.mode === 'neutral' || state.mode === 'venue-search') {
        if (onSearchCancel) {
          onSearchCancel()
          rememberPanelBackFocus()
          onEscape()
          return
        }
        onMinimize?.()
        return
      }
      rememberPanelBackFocus()
      onEscape()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    active,
    minimized,
    onDismissMapPopup,
    onEscape,
    onMinimize,
    onSearchCancel,
    onLeaveMobileRoutes,
    rememberPanelBackFocus,
    state.mode,
  ])

  useIsomorphicLayoutEffect(() => {
    const wasActive = previousActiveRef.current
    previousActiveRef.current = active
    if (!active) {
      previousMinimizedRef.current = minimized
      previousMobileSheetRef.current = mobileSheet
      previousModeRef.current = state.mode
      return
    }
    if (!wasActive) {
      previousMinimizedRef.current = minimized
      previousMobileSheetRef.current = mobileSheet
      previousModeRef.current = state.mode
      return
    }

    const wasMinimized = previousMinimizedRef.current
    previousMinimizedRef.current = minimized
    const wasMobileSheet = previousMobileSheetRef.current
    previousMobileSheetRef.current = mobileSheet
    if (minimized) return
    if (wasMobileSheet !== mobileSheet && !wasMinimized) {
      previousModeRef.current = state.mode
      return
    }

    const pendingFocus = pendingFocusRef.current
    pendingFocusRef.current = null
    const focusTarget = pendingFocus?.element?.isConnected
      ? pendingFocus.element
      : pendingFocus?.key
        ? findFocusTarget(pendingFocus.key)
        : undefined
    const fallbackTarget = pendingFocus?.fallbackKey
      ? findFocusTarget(pendingFocus.fallbackKey)
      : undefined
    const target = focusTarget ?? fallbackTarget
    if (target) {
      focusElement(target)
      previousModeRef.current = state.mode
      return
    }

    if (wasMinimized) {
      if (state.mode === 'venue-search' || state.mode === 'neutral') {
        focusElement(searchInputRef.current)
      } else if (state.mode === 'venue-detail') {
        focusElement(detailHeadingRef.current)
      } else if (state.mode === 'shuttle') {
        focusElement(firstRouteCardRef.current)
      } else {
        focusElement(panelHeadingRef.current)
      }
      previousModeRef.current = state.mode
      return
    }

    if (state.mode === 'venue-search') {
      focusElement(searchInputRef.current)
      previousModeRef.current = state.mode
      return
    }
    if (state.mode === 'venue-detail') {
      focusElement(detailHeadingRef.current)
      previousModeRef.current = state.mode
      return
    }
    if (state.mode === 'shuttle') {
      const enteringShuttle = previousModeRef.current !== 'shuttle'
      const fallback = panelHeadingRef.current

      if (enteringShuttle) {
        shuttleRouteFocusPendingRef.current = true
        shuttleFocusMovedRef.current = false
      }

      if (enteringShuttle || (
        shuttleRouteFocusPendingRef.current &&
        !shuttleFocusMovedRef.current &&
        document.activeElement === fallback
      )) {
        const routeCard = selectedRouteId
          ? findFocusTarget(`shuttle-route-${selectedRouteId}`)
          : firstRouteCardRef.current
        if (routeCard instanceof HTMLButtonElement && !routeCard.disabled) {
          focusElement(routeCard)
          shuttleRouteFocusPendingRef.current = false
        } else if (enteringShuttle) {
          focusElement(fallback)
        }
      }

      previousModeRef.current = state.mode
      return
    }

    focusHistoryRef.current = []
    if (state.mode === 'neutral') {
      if (previousModeRef.current !== null) focusElement(searchInputRef.current)
    } else {
      focusElement(panelHeadingRef.current)
    }
    previousModeRef.current = state.mode
  }, [
    active,
    minimized,
    mobileSheet,
    routesAvailable,
    selectedRouteId,
    state.mode,
    state.selectedVenue?.code,
  ])

  const rememberCurrentControl = (
    event: MouseEvent<HTMLElement>,
    fallbackKey = state.mode === 'shuttle' ? 'neutral-shuttle-opener' : 'venue-search-opener',
  ): void => {
    focusHistoryRef.current.push({
      element: event.currentTarget,
      key: event.currentTarget.dataset.focusId ?? null,
      fallbackKey,
    })
  }

  const handleVenueSelect = (
    result: VenueSearchResult,
    event: MouseEvent<HTMLButtonElement>,
  ): void => {
    rememberCurrentControl(event, 'venue-search-opener')
    onSearchResult?.()
    onVenueSelect(result)
  }

  const handleBuildingSelect = (
    buildingId: string,
    event: MouseEvent<HTMLButtonElement>,
  ): void => {
    rememberCurrentControl(event, 'venue-search-opener')
    onSearchResult?.()
    onBuildingSelect?.(buildingId)
  }

  const handleBack = (): void => {
    rememberPanelBackFocus()
    onBack()
  }

  const handleSelectVenueSearch = (): void => {
    if (state.mode !== 'shuttle') return
    focusHistoryRef.current = []
    pendingStopRowFocusRef.current = null
    pendingFocusRef.current = {
      element: null,
      key: 'explore-venue-segment',
      fallbackKey: null,
    }
    onLeaveMobileRoutes?.()
  }

  const handleSelectShuttle = (event: MouseEvent<HTMLButtonElement>): void => {
    if (state.mode === 'shuttle') return
    pendingFocusRef.current = {
      element: event.currentTarget,
      key: 'explore-shuttle-segment',
      fallbackKey: null,
    }
    focusHistoryRef.current.push({
      element: event.currentTarget,
      key: 'explore-shuttle-segment',
      fallbackKey: null,
    })
    onOpenShuttle()
  }

  const handleFocusStop = (stopId: string, focusTarget?: HTMLElement): void => {
    const returnFocusTarget = focusTarget ?? (
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    )
    pendingStopRowFocusRef.current = returnFocusTarget
    onFocusStop?.(stopId, returnFocusTarget ?? undefined)
  }

  const buildingIndex = buildings ?? EMPTY_BUILDING_INDEX
  const buildingLinks = useMemo(
    () => linkVenuesToBuildings(venues ?? {}, buildingIndex),
    [venues, buildingIndex],
  )
  const searchState = useMemo((): { results: ExploreSearchResult[]; failed: boolean } => {
    if (!venues) return { results: [], failed: false }

    try {
      return {
        results: searchExplore({ venues, buildings: buildingIndex, links: buildingLinks }, state.query),
        failed: false,
      }
    } catch (error) {
      // Venue data is independent from shuttle browsing, so a search failure must not
      // remove the panel or hide the route controls.
      console.error('Venue search failed:', error)
      return { results: [], failed: true }
    }
  }, [state.query, venues, buildingIndex, buildingLinks])
  const selectedVenue = state.selectedVenue
  const selectedBuilding = state.selectedBuildingId ? buildingIndex.byId.get(state.selectedBuildingId) ?? null : null
  const selectedVenueLocation = selectedVenue?.venue.location ?? selectedBuilding?.location
  const venueHasCoordinates = selectedVenue
    ? hasVenueCoordinates(selectedVenue.venue)
    : selectedBuilding !== null
  const venueFloorAndBuilding = selectedVenue
    ? formatVenueFloorAndBuilding(
      selectedVenue.venue.floor,
      getVenueBuildingName(selectedVenue.code),
    )
    : null
  const nearbyStops = venueHasCoordinates && selectedVenueLocation && transitIndex
    ? findNearbyShuttleStops(selectedVenueLocation, transitIndex)
    : []
  const buildingRoomCount = selectedBuilding ? buildingLinks.roomCountByBuildingId.get(selectedBuilding.id) ?? 0 : 0
  const buildingDetailSummary = selectedBuilding
    ? [
      selectedBuilding.parts.length > 1 ? `${selectedBuilding.parts.length} buildings` : null,
      `${buildingRoomCount} ${buildingRoomCount === 1 ? 'room' : 'rooms'}`,
    ].filter((part): part is string => part !== null).join(' · ')
    : ''
  const panelAnnouncement = getPanelAnnouncement(state, selectedBuilding?.name)
  const panelStatus = getVisiblePanelStatus(status)
  const venueSearchView = state.mode === 'neutral' || state.mode === 'venue-search'
  const exploreSegments = venueSearchView || state.mode === 'shuttle'

  return (
    <div className={getExploreShellClassName(state)}>
      <div
        className="explore-view-focus-scope"
        onFocusCapture={handlePanelFocusCapture}
        onBlurCapture={handlePanelBlurCapture}
      >
      <div className="explore-view-header">
        {exploreSegments && (
          <SegmentedControl
            className="explore-segments"
            label="Explore view"
            options={[
              { value: 'venue', label: EXPLORE_LABELS.venue, focusId: 'explore-venue-segment' },
              { value: 'shuttle', label: EXPLORE_LABELS.shuttle, focusId: 'explore-shuttle-segment' },
            ]}
            value={venueSearchView ? 'venue' : 'shuttle'}
            onValueChange={(mode, event) => {
              if (mode === 'venue') handleSelectVenueSearch()
              else handleSelectShuttle(event)
            }}
          />
        )}
        {state.mode === 'venue-detail' && !minimized && (
          <GhostBackButton label={getVenueDetailReturnLabel(state)} onClick={handleBack} />
        )}
        <h2
          id="explore-view-heading"
          ref={panelHeadingRef}
          tabIndex={-1}
          className={exploreSegments || state.mode === 'venue-detail' ? 'visually-hidden' : undefined}
        >
          {getPanelHeading(state)}
        </h2>
      </div>

      {(state.mode === 'venue-search' || state.mode === 'neutral') && (
        <div id="explore-view-content" className="explore-view-content">
          <div className="explore-view-search-row">
            <SearchField
              id="explore-venue-search-input"
              aria-labelledby="explore-view-heading"
              placeholder="e.g. COM1-0210"
              value={state.query}
              inputRef={searchInputRef}
              onFocus={() => {
                if (minimized) onRestore?.()
                onSearchFocus?.()
              }}
              onChange={(event) => onQueryChange(event.target.value)}
              autoComplete="off"
            />
            {state.query && (
              <IconButton
                variant="plain"
                className="explore-view-search-clear"
                label="Clear venue search"
                icon={<CloseIcon />}
                onClick={() => {
                  onQueryChange('')
                  searchInputRef.current?.focus()
                }}
              />
            )}
          </div>
          <div className="navigation-panel-content explore-view-search-body">
            {venues === null || searchState.failed ? (
              <p className="explore-view-status" role="status" aria-live="polite">
                Venue search is unavailable right now. Shuttle browsing is still available.
              </p>
            ) : state.query.trim() ? (
              <ScrollArea className="navigation-panel-scroll-content explore-view-results" aria-label="Venue search results">
                {searchState.results.length > 0 ? (
                  searchState.results.map((item) => {
                    if (item.kind === 'building') {
                      const { entry } = item
                      const secondary = entry.parts.length > 1
                        ? `${entry.parts.length} buildings`
                        : entry.parts[0].address ?? ''
                      return (
                        <button
                          className="explore-view-result"
                          data-focus-id={`building-result-${entry.id}`}
                          type="button"
                          key={`building:${entry.id}`}
                          onClick={(event) => handleBuildingSelect(entry.id, event)}
                          aria-label={secondary ? `${entry.name}, building, ${secondary}` : `${entry.name}, building`}
                        >
                          <span className="explore-view-result-identity">
                            <BuildingIcon className="location-identity-icon location-identity-icon--building" />
                            <strong>{entry.name}</strong>
                          </span>
                          {secondary && <span>{secondary}</span>}
                        </button>
                      )
                    }
                    const { result } = item
                    return (
                      <button
                        className="explore-view-result"
                        data-focus-id={`venue-result-${result.code}`}
                        type="button"
                        key={`venue:${result.code}`}
                        onClick={(event) => handleVenueSelect(result, event)}
                        aria-label={`${result.code}, venue, ${result.venue.roomName}`}
                      >
                        <span className="explore-view-result-identity">
                          <BuildingIcon className="location-identity-icon location-identity-icon--venue" />
                          <strong>{result.code}</strong>
                        </span>
                        <span>{result.venue.roomName}</span>
                      </button>
                    )
                  })
                ) : (
                  <p className="explore-view-status" role="status" aria-live="polite">No matching venues.</p>
                )}
              </ScrollArea>
            ) : (
              <div className="explore-view-search-prompt">
                <SearchIcon />
                <p>Search for a venue</p>
              </div>
            )}
          </div>
        </div>
      )}

      {state.mode === 'venue-detail' && (selectedVenue || selectedBuilding) && (
        <div
          id="explore-view-content"
          className="navigation-panel-content navigation-panel-scroll-content explore-view-content explore-view-detail"
        >
          {selectedVenue ? (
            <>
            <div className="venue-detail-identity">
              <h3
                id="explore-venue-detail-heading"
                ref={detailHeadingRef}
                tabIndex={-1}
                aria-label={`${selectedVenue.code}, venue`}
              >
                <BuildingIcon className="location-identity-icon location-identity-icon--venue" />
                {selectedVenue.code}
              </h3>
              <p className="venue-detail-name">{selectedVenue.venue.roomName}</p>
            </div>
            {venueFloorAndBuilding && (
              <p className="venue-detail-location">
                <BuildingIcon className="venue-detail-icon venue-detail-building-icon" />
                <span>{venueFloorAndBuilding}</span>
              </p>
            )}
            <div className="venue-detail-actions">
              <NavigateButton
                disabled={!venueHasCoordinates}
                onClick={() => {
                  if (selectedVenue) onNavigateToVenue?.(selectedVenue.code)
                }}
              />
              <a
                className="venue-detail-action venue-detail-nusmods"
                href={`https://nusmods.com/venues/${encodeURIComponent(selectedVenue.code)}`}
                target="_blank"
                rel="noreferrer"
              >
                <span>View in</span>
                <img src={nusmodsLogoUrl} alt="NUSMods" />
              </a>
            </div>
            </>
          ) : selectedBuilding ? (
            <>
              <div className="venue-detail-identity">
                <h3
                  id="explore-venue-detail-heading"
                  ref={detailHeadingRef}
                  tabIndex={-1}
                  aria-label={`${selectedBuilding.name}, building`}
                >
                  <BuildingIcon className="location-identity-icon location-identity-icon--building" />
                  {selectedBuilding.name}
                </h3>
                {selectedBuilding.parts.length === 1 && selectedBuilding.parts[0].address && (
                  <p className="venue-detail-name">{selectedBuilding.parts[0].address}</p>
                )}
              </div>
              <p className="venue-detail-location">
                <BuildingIcon className="venue-detail-icon venue-detail-building-icon" />
                <span>{buildingDetailSummary}</span>
              </p>
              {selectedBuilding.parts.length > 1 && (
                <section className="venue-building-parts" aria-labelledby="venue-building-parts-heading">
                  <h4 id="venue-building-parts-heading">Buildings in this group</h4>
                  <ul>
                    {selectedBuilding.parts.map((part, index) => (
                      <li key={part.id}>{part.address ?? `${part.name}, part ${index + 1}`}</li>
                    ))}
                  </ul>
                </section>
              )}
              <div className="venue-detail-actions">
                <NavigateButton
                  onClick={() => onNavigateToBuilding?.(selectedBuilding.id)}
                />
              </div>
            </>
          ) : null}
          {venueHasCoordinates && (
            <section className="venue-nearby-stops" aria-labelledby="venue-nearby-stops-heading">
              <h4 id="venue-nearby-stops-heading">
                <BusIcon />
                Nearby bus stops within 500 m
              </h4>
              {transitIndex === null ? (
                <p className="venue-nearby-empty" role="status">Nearby stops are unavailable right now.</p>
              ) : nearbyStops.length === 0 ? (
                <p className="venue-nearby-empty" role="status">No NUS shuttle stops within 500 m.</p>
              ) : (
                <div className="venue-nearby-stop-list">
                  {nearbyStops.map(({ stop, services }) => (
                    <button
                      key={stop.id}
                      className="nearby-stop-row"
                      type="button"
                      data-stop-id={stop.id}
                      aria-label={`Nearby shuttle stop ${stop.longName}, code ${stop.id}, services ${services.map(({ id }) => id).join(', ')}. View stop details`}
                      onClick={(event) => handleFocusStop(stop.id, event.currentTarget)}
                    >
                      <span className="nearby-stop-identity">
                        <span className="nearby-stop-name">
                          <BusIcon className="location-identity-icon location-identity-icon--stop" />
                          <strong>{stop.longName}</strong>
                        </span>
                        <small>{stop.id}</small>
                      </span>
                      <span className="nearby-stop-services" aria-hidden="true">
                        {services.map((route) => (
                          <span
                            key={route.id}
                            className="venue-detail-service-badge"
                            data-service-id={route.id}
                            style={{
                              backgroundColor: route.color,
                              color: getRouteContrastTextColor(route.color),
                            }}
                          >
                            {route.id}
                          </span>
                        ))}
                      </span>
                      <ChevronRightIcon className="nearby-stop-arrow" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {state.mode === 'shuttle' && (
        <div
          id="explore-view-content"
          className="navigation-panel-content explore-view-content"
        >
          {renderShuttleRoutes({
            firstRouteCardRef,
            onFocusStop: handleFocusStop,
          })}
        </div>
      )}
      {panelStatus && (
        <p
          className={`navigation-panel-content explore-view-status explore-view-status-${panelStatus.kind}`}
          role="status"
          aria-live={panelStatus.kind === 'failure' ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          {panelStatus.message}
        </p>
      )}
      {minimized && panelStatus?.kind === 'failure' && (
        <span
          className="explore-view-failure-indicator"
          role="img"
          aria-label={`Map data unavailable: ${panelStatus.message}`}
        >
          !
        </span>
      )}
      {panelAnnouncement && (
        <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {panelAnnouncement}
        </p>
      )}
      </div>
    </div>
  )
}
