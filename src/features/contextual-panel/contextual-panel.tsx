import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type MouseEvent,
  type Ref,
  type RefObject,
  type ReactNode,
} from 'react'
import { searchVenues, type VenueSearchResult } from '../../domain/venue/search'
import type { VenueLocationMap } from '../../domain/venue/types'
import { MobileSheetHandle } from '../../ui/mobile-sheet-handle'
import type { ContextualPanelState } from './state'
import type { PanelStatus } from './status'

interface FocusTarget {
  readonly element: HTMLElement | null
  readonly key: string | null
  readonly fallbackKey: string | null
}

interface ShuttleRouteRenderOptions {
  readonly mobileRouteDetail: boolean
  readonly firstRouteCardRef: RefObject<HTMLButtonElement | null>
  readonly onOpenRouteDetail: () => void
  readonly onShowAllRoutes: () => void
  readonly onFocusStop: (stopId: string) => void
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

interface ContextualPanelProps {
  state: ContextualPanelState
  venues: VenueLocationMap | null
  shuttleRoutesAvailable: boolean
  renderShuttleRoutes: (
    selectRef: RefObject<HTMLSelectElement | null>,
    options: ShuttleRouteRenderOptions,
  ) => ReactNode
  minimized?: boolean
  mobileViewport?: boolean
  active?: boolean
  onRestore?: () => void
  onMinimize?: () => void
  containerRef?: Ref<HTMLElement>
  status?: PanelStatus | null
  selectedRouteId?: string | null
  onQueryChange: (query: string) => void
  onVenueSelect: (result: VenueSearchResult) => void
  onOpenVenueSearch: () => void
  onOpenShuttle: () => void
  onLeaveMobileRoutes?: () => void
  onFocusStop?: (stopId: string) => void
  onOpenShuttleRouteDetail?: () => void
  onShowAllRoutes?: () => void
  onBack: () => void
  onClose: () => void
  onEscape: () => void
  onDismissMapPopup?: () => boolean
}

function getPanelHeading(
  state: ContextualPanelState,
  selectedRouteId: string | null,
): string {
  if (state.mode === 'shuttle') return 'Shuttle routes'
  if (state.mode === 'shuttle-route-detail') {
    return selectedRouteId ? `${selectedRouteId} Shuttle` : 'Shuttle route details'
  }
  if (state.mode === 'venue-detail') return 'Venue details'
  return 'Explore NUS'
}

function findFocusTarget(key: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-contextual-focus-id]'))
    .find((element) => element.dataset.contextualFocusId === key)
}

function getPanelAnnouncement(
  state: ContextualPanelState,
  selectedRouteId: string | null,
): string | null {
  if (state.mode === 'shuttle') return null
  if (state.mode === 'shuttle-route-detail' && selectedRouteId) {
    return `Route ${selectedRouteId} details opened.`
  }
  if (state.mode === 'venue-detail' && state.selectedVenue) {
    return `Venue details opened for ${state.selectedVenue.code}.`
  }
  if (state.mode === 'venue-search') return 'Venue search opened.'
  return 'Map context closed.'
}

function getVisiblePanelStatus(
  mode: ContextualPanelState['mode'],
  status: PanelStatus | null | undefined,
): PanelStatus | null {
  if (!status || (mode === 'venue-detail' && status.kind === 'success')) return null
  return status
}

export function ContextualPanel({
  state,
  venues,
  shuttleRoutesAvailable,
  renderShuttleRoutes,
  minimized = false,
  mobileViewport = true,
  active = true,
  onRestore,
  onMinimize,
  containerRef,
  status,
  selectedRouteId = null,
  onQueryChange,
  onVenueSelect,
  onOpenVenueSearch,
  onOpenShuttle,
  onLeaveMobileRoutes,
  onFocusStop,
  onOpenShuttleRouteDetail,
  onShowAllRoutes,
  onBack,
  onClose,
  onEscape,
  onDismissMapPopup,
}: ContextualPanelProps) {
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)
  const restorePanelButtonRef = useRef<HTMLButtonElement>(null)
  const setRestorePanelButtonRef = useCallback((button: HTMLButtonElement | null): void => {
    restorePanelButtonRef.current = button
  }, [])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const detailHeadingRef = useRef<HTMLHeadingElement>(null)
  const routeSelectRef = useRef<HTMLSelectElement>(null)
  const firstRouteCardRef = useRef<HTMLButtonElement>(null)
  const shuttleBackRef = useRef<HTMLButtonElement>(null)
  const shuttleRouteDetailBackRef = useRef<HTMLButtonElement>(null)
  const focusHistoryRef = useRef<FocusTarget[]>([])
  const pendingFocusRef = useRef<FocusTarget | null>(null)
  const previousModeRef = useRef<ContextualPanelState['mode'] | null>(null)
  const previousMinimizedRef = useRef(minimized)
  const previousMobileViewportRef = useRef(mobileViewport)
  const previousActiveRef = useRef(active)
  const panelFocusRef = useRef(false)
  const shuttleRouteFocusPendingRef = useRef(false)
  const shuttleFocusMovedRef = useRef(false)
  const programmaticFocusRef = useRef(false)
  const pendingMinimizeFocusRef = useRef(false)
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
    if (state.mode === 'shuttle-route-detail' && selectedRouteId) {
      pendingFocusRef.current = {
        element: null,
        key: null,
        fallbackKey: `shuttle-route-${selectedRouteId}`,
      }
      return
    }
    pendingFocusRef.current = focusHistoryRef.current.pop() ?? null
  }, [selectedRouteId, state.mode])

  const handleShowAllRoutes = (): void => {
    if (selectedRouteId) {
      pendingFocusRef.current = {
        element: null,
        key: null,
        fallbackKey: `shuttle-route-${selectedRouteId}`,
      }
    }
    onShowAllRoutes?.()
  }

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
      if (mobileViewport && state.mode === 'shuttle') {
        focusHistoryRef.current = []
        pendingStopRowFocusRef.current = null
        pendingFocusRef.current = {
          element: null,
          key: 'neutral-shuttle-opener',
          fallbackKey: null,
        }
        onLeaveMobileRoutes?.()
        return
      }
      if (mobileViewport && state.mode === 'neutral' && onMinimize) {
        pendingMinimizeFocusRef.current = true
        onMinimize()
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
    mobileViewport,
    onDismissMapPopup,
    onEscape,
    onMinimize,
    onLeaveMobileRoutes,
    rememberPanelBackFocus,
    state.mode,
  ])

  useIsomorphicLayoutEffect(() => {
    const wasActive = previousActiveRef.current
    previousActiveRef.current = active
    if (!active) {
      previousMinimizedRef.current = minimized
      previousMobileViewportRef.current = mobileViewport
      previousModeRef.current = state.mode
      return
    }
    if (!wasActive) {
      previousMinimizedRef.current = minimized
      previousMobileViewportRef.current = mobileViewport
      previousModeRef.current = state.mode
      return
    }

    const wasMinimized = previousMinimizedRef.current
    previousMinimizedRef.current = minimized
    const wasMobileViewport = previousMobileViewportRef.current
    previousMobileViewportRef.current = mobileViewport
    if (minimized) {
      if (!wasMinimized && pendingMinimizeFocusRef.current) {
        pendingMinimizeFocusRef.current = false
        focusElement(restorePanelButtonRef.current)
      }
      return
    }

    if (wasMobileViewport !== mobileViewport && !wasMinimized) {
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
      if (!mobileViewport && !panelFocusRef.current) {
        previousModeRef.current = state.mode
        return
      }
      if (state.mode === 'venue-search') {
        focusElement(searchInputRef.current)
      } else if (state.mode === 'venue-detail') {
        focusElement(detailHeadingRef.current)
      } else if (state.mode === 'shuttle') {
        focusElement(routeSelectRef.current && !routeSelectRef.current.disabled
          ? routeSelectRef.current
          : shuttleBackRef.current)
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
    if (state.mode === 'shuttle-route-detail') {
      focusElement(panelHeadingRef.current)
      previousModeRef.current = state.mode
      return
    }
    if (state.mode === 'shuttle') {
      const enteringShuttle = previousModeRef.current !== 'shuttle'
      const fallback = shuttleBackRef.current ?? panelHeadingRef.current

      if (enteringShuttle) {
        shuttleRouteFocusPendingRef.current = true
        shuttleFocusMovedRef.current = false
      }

      if (routeSelectRef.current && !routeSelectRef.current.disabled) {
        const mayFocusRouteSelect = enteringShuttle || (
          shuttleRouteFocusPendingRef.current &&
          !shuttleFocusMovedRef.current &&
          document.activeElement === fallback
        )
        if (mayFocusRouteSelect) {
          focusElement(routeSelectRef.current)
        }
        shuttleRouteFocusPendingRef.current = false
      } else if (enteringShuttle || (
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
    focusElement(panelHeadingRef.current)
    previousModeRef.current = state.mode
  }, [
    active,
    minimized,
    mobileViewport,
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
      key: event.currentTarget.dataset.contextualFocusId ?? null,
      fallbackKey,
    })
  }

  const handleOpenVenueSearch = (event: MouseEvent<HTMLButtonElement>): void => {
    if (state.mode !== 'venue-search') rememberCurrentControl(event, 'venue-search-opener')
    onOpenVenueSearch()
  }

  const handleOpenShuttle = (event: MouseEvent<HTMLButtonElement>): void => {
    if (state.mode !== 'shuttle') rememberCurrentControl(event, 'neutral-shuttle-opener')
    onOpenShuttle()
  }

  const handleVenueSelect = (
    result: VenueSearchResult,
    event: MouseEvent<HTMLButtonElement>,
  ): void => {
    rememberCurrentControl(event, 'venue-search-opener')
    onVenueSelect(result)
  }

  const handleBack = (): void => {
    rememberPanelBackFocus()
    onBack()
  }

  const handleOpenRouteDetail = (): void => {
    onOpenShuttleRouteDetail?.()
  }

  const handleClose = (): void => {
    pendingFocusRef.current = focusHistoryRef.current.at(-1) ?? null
    focusHistoryRef.current = []
    onClose()
  }

  const handleLeaveMobileRoutes = (): void => {
    focusHistoryRef.current = []
    pendingStopRowFocusRef.current = null
    pendingFocusRef.current = {
      element: null,
      key: 'neutral-shuttle-opener',
      fallbackKey: null,
    }
    onLeaveMobileRoutes?.()
  }

  const handleFocusStop = (stopId: string): void => {
    pendingStopRowFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    onFocusStop?.(stopId)
  }

  const handleMinimize = (): void => {
    pendingMinimizeFocusRef.current = true
    onMinimize?.()
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
  const panelAnnouncement = getPanelAnnouncement(state, selectedRouteId)
  const panelStatus = getVisiblePanelStatus(state.mode, status)

  return (
    <section
      className={`contextual-panel contextual-panel-${state.mode}${minimized ? ' contextual-panel-minimized' : ''}`}
      ref={containerRef}
      aria-labelledby="contextual-panel-heading"
      data-minimized={minimized}
      data-mobile-sheet
      data-expanded={!minimized}
      onFocusCapture={handlePanelFocusCapture}
      onBlurCapture={handlePanelBlurCapture}
    >
      <div className="mobile-sheet-handle-row">
        <MobileSheetHandle
          expanded={!minimized}
          label="Explore panel"
          controlsId="contextual-panel-content"
          onButtonRef={setRestorePanelButtonRef}
          onExpandedChange={(expanded) => {
            if (expanded) onRestore?.()
            else handleMinimize()
          }}
        />
      </div>
      <div className="contextual-panel-header">
        {mobileViewport && state.mode === 'shuttle' && !minimized && (
          <button
            type="button"
            className="mobile-routes-explore-button"
            onClick={handleLeaveMobileRoutes}
          >
            <span aria-hidden="true">←</span> Explore
          </button>
        )}
        <h2
          id="contextual-panel-heading"
          ref={panelHeadingRef}
          tabIndex={-1}
        >
          {getPanelHeading(state, selectedRouteId)}
        </h2>
        {state.mode !== 'neutral' && !(mobileViewport && state.mode === 'shuttle') && (
          <button type="button" onClick={handleClose} aria-label="Close map context">
            Close
          </button>
        )}
      </div>

      {state.mode === 'neutral' && (
        <div id="contextual-panel-content" className="contextual-panel-content" data-mobile-sheet-content>
          <p>Search for a venue or browse the shuttle network.</p>
          <div className="contextual-panel-actions">
            <button
              data-contextual-focus-id="venue-search-opener"
              type="button"
              onClick={handleOpenVenueSearch}
            >
              Find a venue
            </button>
            <button
              data-contextual-focus-id="neutral-shuttle-opener"
              type="button"
              onClick={handleOpenShuttle}
            >
              Browse shuttle routes
            </button>
          </div>
        </div>
      )}

      {state.mode === 'venue-search' && (
        <div id="contextual-panel-content" className="contextual-panel-content" data-mobile-sheet-content>
          <label htmlFor="contextual-venue-search-input">Find a venue</label>
          <div className="contextual-panel-search-row">
            <input
              id="contextual-venue-search-input"
              type="search"
              placeholder="e.g. COM1-0210"
              value={state.query}
              ref={searchInputRef}
              onChange={(event) => onQueryChange(event.target.value)}
              autoComplete="off"
            />
            {state.query && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                aria-label="Clear venue search"
              >
                Clear
              </button>
            )}
          </div>
          {venues === null || searchState.failed ? (
            <p className="contextual-panel-status" role="status" aria-live="polite">
              Venue search is unavailable right now. Shuttle browsing is still available.
            </p>
          ) : state.query.trim() ? (
            <div className="contextual-panel-results" aria-label="Venue search results">
              {searchState.results.length > 0 ? (
                searchState.results.map((result) => (
                  <button
                    className="contextual-panel-result"
                    data-contextual-focus-id={`venue-result-${result.code}`}
                    type="button"
                    key={result.code}
                    onClick={(event) => handleVenueSelect(result, event)}
                  >
                    <strong>{result.code}</strong>
                    <span>{result.venue.roomName}</span>
                  </button>
                ))
              ) : (
                <p className="contextual-panel-status" role="status" aria-live="polite">No matching venues.</p>
              )}
            </div>
          ) : (
            <p className="contextual-panel-status">Search by venue code or room name.</p>
          )}
          <button
            data-contextual-focus-id="venue-search-shuttle-opener"
            type="button"
            onClick={handleOpenShuttle}
          >
            Browse shuttle routes
          </button>
        </div>
      )}

      {state.mode === 'venue-detail' && state.selectedVenue && (
        <div
          id="contextual-panel-content"
          className="contextual-panel-content contextual-panel-detail"
          data-mobile-sheet-content
        >
          <button type="button" onClick={handleBack} aria-label="Back to venue search">
            Back
          </button>
          <h3 id="contextual-venue-detail-heading" ref={detailHeadingRef} tabIndex={-1}>
            {state.selectedVenue.code}
          </h3>
          <p><strong>Room:</strong> {state.selectedVenue.venue.roomName}</p>
          {state.selectedVenue.venue.floor !== undefined && state.selectedVenue.venue.floor !== null && (
            <p><strong>Floor:</strong> {state.selectedVenue.venue.floor}</p>
          )}
          <button
            data-contextual-focus-id="venue-detail-shuttle-opener"
            type="button"
            onClick={handleOpenShuttle}
          >
            Browse shuttle routes
          </button>
        </div>
      )}

      {(state.mode === 'shuttle' || state.mode === 'shuttle-route-detail') && (
        <div id="contextual-panel-content" className="contextual-panel-content" data-mobile-sheet-content>
          {mobileViewport && state.mode === 'shuttle' ? null : state.mode === 'shuttle-route-detail' ? (
            <button
              ref={shuttleRouteDetailBackRef}
              type="button"
              onClick={handleBack}
              aria-label="Back to shuttle routes"
            >
              Back to routes
            </button>
          ) : (
            <button
              ref={shuttleBackRef}
              type="button"
              onClick={handleBack}
              aria-label="Back to previous map context"
            >
              Back
            </button>
          )}
          {renderShuttleRoutes(routeSelectRef, {
            mobileRouteDetail: state.mode === 'shuttle-route-detail',
            firstRouteCardRef,
            onOpenRouteDetail: handleOpenRouteDetail,
            onShowAllRoutes: handleShowAllRoutes,
            onFocusStop: handleFocusStop,
          })}
        </div>
      )}
      {panelStatus && (
        <p
          className={`contextual-panel-status contextual-panel-status-${panelStatus.kind}`}
          role="status"
          aria-live={panelStatus.kind === 'failure' ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          {panelStatus.message}
        </p>
      )}
      {minimized && panelStatus?.kind === 'failure' && (
        <span
          className="contextual-panel-failure-indicator"
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
    </section>
  )
}
