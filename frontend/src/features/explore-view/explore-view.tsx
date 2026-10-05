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
import { searchVenues, type VenueSearchResult } from '../../domain/venue/search'
import type { VenueLocationMap } from '../../domain/venue/types'
import {
  formatVenueFloorAndBuilding,
  getVenueBuildingName,
  hasVenueCoordinates,
} from '../../domain/venue/details'
import { findNearbyShuttleStops, type TransitIndex } from '../../domain/transit'
import { GhostBackButton } from '../../ui/ghost-back-button'
import { NavigateButton } from '../../ui/navigate-button'
import { ScrollArea } from '../../ui/scroll-area'
import { SearchField } from '../../ui/search-field'
import { getRouteContrastTextColor } from '../../ui/route-color'
import type { ExploreViewMode, ExploreViewState } from './state'
import type { PanelStatus } from './status'

interface FocusTarget {
  readonly element: HTMLElement | null
  readonly key: string | null
  readonly fallbackKey: string | null
}
interface ShuttleRouteRenderOptions {
  readonly firstRouteCardRef: RefObject<HTMLButtonElement | null>
  readonly onFocusStop: (stopId: string) => void
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
  transitIndex?: TransitIndex | null
  shuttleRoutesAvailable: boolean
  renderShuttleRoutes: (options: ShuttleRouteRenderOptions) => ReactNode
  minimized?: boolean
  mobileSheet?: boolean
  active?: boolean
  onRestore?: () => void
  onMinimize?: () => void
  status?: PanelStatus | null
  selectedRouteId?: string | null
  onQueryChange: (query: string) => void
  onVenueSelect: (result: VenueSearchResult) => void
  onNavigateToVenue?: (venueCode: string) => void
  onOpenShuttle: () => void
  onLeaveMobileRoutes?: () => void
  onFocusStop?: (stopId: string) => void
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
  return Array.from(document.querySelectorAll<HTMLElement>('[data-explore-focus-id]'))
    .find((element) => element.dataset.exploreFocusId === key)
}

function getPanelAnnouncement(state: ExploreViewState): string | null {
  if (state.mode === 'shuttle') return null
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
  transitIndex = null,
  shuttleRoutesAvailable,
  renderShuttleRoutes,
  minimized = false,
  mobileSheet = true,
  active = true,
  onRestore,
  onMinimize,
  status,
  selectedRouteId = null,
  onQueryChange,
  onVenueSelect,
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
      key: event.currentTarget.dataset.exploreFocusId ?? null,
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

  const handleFocusStop = (stopId: string): void => {
    pendingStopRowFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    onFocusStop?.(stopId)
  }

  const searchState = useMemo(() => {
    if (!venues) return { results: [], failed: false }

    try {
      return { results: searchVenues(venues, state.query), failed: false }
    } catch (error) {
      // Venue data is independent from shuttle browsing, so a search failure must not
      // remove the panel or hide the route controls.
      console.error('Venue search failed:', error)
      return { results: [], failed: true }
    }
  }, [state.query, venues])
  const selectedVenue = state.selectedVenue
  const selectedVenueLocation = selectedVenue?.venue.location
  const venueHasCoordinates = selectedVenue ? hasVenueCoordinates(selectedVenue.venue) : false
  const venueFloorAndBuilding = selectedVenue
    ? formatVenueFloorAndBuilding(
      selectedVenue.venue.floor,
      getVenueBuildingName(selectedVenue.code),
    )
    : null
  const nearbyStops = venueHasCoordinates && selectedVenueLocation && transitIndex
    ? findNearbyShuttleStops(selectedVenueLocation, transitIndex)
    : []
  const panelAnnouncement = getPanelAnnouncement(state)
  const panelStatus = getVisiblePanelStatus(status)
  const venueSearchView = state.mode === 'neutral' || state.mode === 'venue-search'
  const exploreSegments = venueSearchView || state.mode === 'shuttle'

  return (
    <div
      className="explore-view-focus-scope"
      onFocusCapture={handlePanelFocusCapture}
      onBlurCapture={handlePanelBlurCapture}
    >
      <div className="explore-view-header">
        {exploreSegments && (
          <div
            className="explore-segments"
            role="group"
            aria-label="Explore view"
            data-mobile-sheet-content
          >
            <button
              type="button"
              data-explore-focus-id="explore-venue-segment"
              aria-pressed={venueSearchView}
              onClick={handleSelectVenueSearch}
            >
              {EXPLORE_LABELS.venue}
            </button>
            <button
              type="button"
              data-explore-focus-id="explore-shuttle-segment"
              aria-pressed={state.mode === 'shuttle'}
              onClick={handleSelectShuttle}
            >
              {EXPLORE_LABELS.shuttle}
            </button>
          </div>
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
              <button
                type="button"
                className="explore-view-search-clear"
                onClick={() => {
                  onQueryChange('')
                  searchInputRef.current?.focus()
                }}
                aria-label="Clear venue search"
              >
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <path d="M6 6 18 18M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
          <div className="explore-view-search-body" data-mobile-sheet-content>
            {venues === null || searchState.failed ? (
              <p className="explore-view-status" role="status" aria-live="polite">
                Venue search is unavailable right now. Shuttle browsing is still available.
              </p>
            ) : state.query.trim() ? (
              <ScrollArea className="explore-view-results" aria-label="Venue search results">
                {searchState.results.length > 0 ? (
                  searchState.results.map((result) => (
                    <button
                      className="explore-view-result"
                      data-explore-focus-id={`venue-result-${result.code}`}
                      type="button"
                      key={result.code}
                      onClick={(event) => handleVenueSelect(result, event)}
                    >
                      <strong>{result.code}</strong>
                      <span>{result.venue.roomName}</span>
                    </button>
                  ))
                ) : (
                  <p className="explore-view-status" role="status" aria-live="polite">No matching venues.</p>
                )}
              </ScrollArea>
            ) : (
              <div className="explore-view-search-prompt">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32">
                  <circle cx="14" cy="14" r="8" />
                  <path d="m20 20 7 7" />
                </svg>
                <p>Search for a venue</p>
              </div>
            )}
          </div>
        </div>
      )}

      {state.mode === 'venue-detail' && state.selectedVenue && (
        <div
          id="explore-view-content"
          className="explore-view-content explore-view-detail"
          data-mobile-sheet-content
        >
          <div className="venue-detail-identity">
            <h3 id="explore-venue-detail-heading" ref={detailHeadingRef} tabIndex={-1}>
              {state.selectedVenue.code}
            </h3>
            <p className="venue-detail-name">{state.selectedVenue.venue.roomName}</p>
          </div>
          {venueFloorAndBuilding && (
            <p className="venue-detail-location">
              <svg aria-hidden="true" focusable="false" className="venue-detail-icon venue-detail-building-icon" viewBox="0 0 24 24">
                <path d="M4 21h16M6 21V4h8v17m0-11h4v11M9 8h2m-2 4h2m-2 4h2m4-2h2m-2 4h2" />
              </svg>
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
              href={`https://nusmods.com/venues/${encodeURIComponent(state.selectedVenue.code)}`}
              target="_blank"
              rel="noreferrer"
            >
              <span>View in</span>
              <img src={`${import.meta.env.BASE_URL}nusmods-logo.svg`} alt="NUSMods" />
            </a>
          </div>
          {venueHasCoordinates && (
            <section className="venue-nearby-stops" aria-labelledby="venue-nearby-stops-heading">
              <h4 id="venue-nearby-stops-heading">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <path d="M6 3h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-1l1.5 2h-2.4L14 19h-4l-1.1 2H6.5L8 19H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 3v6h12V6H6Zm1 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
                </svg>
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
                      aria-label={`Nearby stop ${stop.longName}, code ${stop.id}, services ${services.map(({ id }) => id).join(', ')}. View stop details`}
                      onClick={() => handleFocusStop(stop.id)}
                    >
                      <span className="nearby-stop-identity">
                        <strong>{stop.longName}</strong>
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
                      <svg aria-hidden="true" focusable="false" className="nearby-stop-arrow" viewBox="0 0 24 24">
                        <path d="m9 5 7 7-7 7" />
                      </svg>
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
          className="explore-view-content"
          data-mobile-sheet-content
        >
          {renderShuttleRoutes({
            firstRouteCardRef,
            onFocusStop: handleFocusStop,
          })}
        </div>
      )}
      {panelStatus && (
        <p
          className={`explore-view-status explore-view-status-${panelStatus.kind}`}
          data-mobile-sheet-content={mobileSheet && panelStatus.kind === 'success' ? '' : undefined}
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
  )
}
