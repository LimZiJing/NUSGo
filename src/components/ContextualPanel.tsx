import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MouseEvent,
} from 'react'
import { searchVenues, type VenueSearchResult } from '../domain/venue/search'
import type { TransitNetwork } from '../domain/transit/types'
import type { TransitNetworkIndex } from '../domain/transit'
import type { VenueLocationMap } from '../domain/venue/types'
import type { ContextualPanelState } from '../domain/contextual-panel/state'
import { TransitRouteControl } from './TransitRouteControl'

interface FocusTarget {
  readonly element: HTMLElement
  readonly key: string | null
  readonly fallbackKey: string | null
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

interface ContextualPanelProps {
  state: ContextualPanelState
  venues: VenueLocationMap | null
  network: TransitNetwork | null
  networkIndex: TransitNetworkIndex | null
  selectedRouteId: string | null
  onQueryChange: (query: string) => void
  onVenueSelect: (result: VenueSearchResult) => void
  onOpenVenueSearch: () => void
  onOpenShuttle: () => void
  onBack: () => void
  onClose: () => void
  onEscape: () => void
  onRouteSelect: (routeId: string | null) => void
}

function getPanelHeading(state: ContextualPanelState): string {
  if (state.mode === 'shuttle') return 'Shuttle routes'
  if (state.mode === 'venue-detail') return 'Venue details'
  return 'Explore NUS'
}

function findFocusTarget(key: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-contextual-focus-id]'))
    .find((element) => element.dataset.contextualFocusId === key)
}

function getPanelAnnouncement(state: ContextualPanelState): string | null {
  if (state.mode === 'shuttle') return null
  if (state.mode === 'venue-detail' && state.selectedVenue) {
    return `Venue details opened for ${state.selectedVenue.code}.`
  }
  if (state.mode === 'venue-search') return 'Venue search opened.'
  return 'Map context closed.'
}

export function ContextualPanel({
  state,
  venues,
  network,
  networkIndex,
  selectedRouteId,
  onQueryChange,
  onVenueSelect,
  onOpenVenueSearch,
  onOpenShuttle,
  onBack,
  onClose,
  onEscape,
  onRouteSelect,
}: ContextualPanelProps) {
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const detailHeadingRef = useRef<HTMLHeadingElement>(null)
  const routeSelectRef = useRef<HTMLSelectElement>(null)
  const shuttleBackRef = useRef<HTMLButtonElement>(null)
  const focusHistoryRef = useRef<FocusTarget[]>([])
  const pendingFocusRef = useRef<FocusTarget | null>(null)
  const previousModeRef = useRef<ContextualPanelState['mode'] | null>(null)
  const shuttleRouteFocusPendingRef = useRef(false)
  const shuttleFocusMovedRef = useRef(false)
  const programmaticFocusRef = useRef(false)

  const focusElement = (element: HTMLElement | null): void => {
    if (!element) return
    programmaticFocusRef.current = true
    element.focus()
    programmaticFocusRef.current = false
  }

  const handlePanelFocusCapture = (): void => {
    if (
      state.mode === 'shuttle' &&
      shuttleRouteFocusPendingRef.current &&
      !programmaticFocusRef.current
    ) {
      shuttleRouteFocusPendingRef.current = false
      shuttleFocusMovedRef.current = true
    }
  }

  const routesAvailable = (networkIndex?.routes ?? network?.routes ?? []).length > 0

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      pendingFocusRef.current = focusHistoryRef.current.pop() ?? null
      onEscape()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onEscape])

  useIsomorphicLayoutEffect(() => {
    const pendingFocus = pendingFocusRef.current
    pendingFocusRef.current = null
    const focusTarget = pendingFocus?.element.isConnected
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
      } else if (enteringShuttle) {
        focusElement(fallback)
      }

      previousModeRef.current = state.mode
      return
    }

    focusHistoryRef.current = []
    focusElement(panelHeadingRef.current)
    previousModeRef.current = state.mode
  }, [routesAvailable, state.mode, state.selectedVenue?.code])

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
    pendingFocusRef.current = focusHistoryRef.current.pop() ?? null
    onBack()
  }

  const handleClose = (): void => {
    pendingFocusRef.current = focusHistoryRef.current.at(-1) ?? null
    focusHistoryRef.current = []
    onClose()
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
  const panelAnnouncement = getPanelAnnouncement(state)

  return (
    <section
      className={`contextual-panel contextual-panel-${state.mode}`}
      aria-labelledby="contextual-panel-heading"
      onFocusCapture={handlePanelFocusCapture}
    >
      <div className="contextual-panel-header">
        <h2 id="contextual-panel-heading" ref={panelHeadingRef} tabIndex={-1}>
          {getPanelHeading(state)}
        </h2>
        {state.mode !== 'neutral' && (
          <button type="button" onClick={handleClose} aria-label="Close map context">
            Close
          </button>
        )}
      </div>

      {state.mode === 'neutral' && (
        <div className="contextual-panel-content">
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
        <div className="contextual-panel-content">
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
        <div className="contextual-panel-content contextual-panel-detail">
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

      {state.mode === 'shuttle' && (
        <div className="contextual-panel-content">
          <button
            ref={shuttleBackRef}
            type="button"
            onClick={handleBack}
            aria-label="Back to previous map context"
          >
            Back
          </button>
          <TransitRouteControl
            network={network}
            networkIndex={networkIndex}
            selectedRouteId={selectedRouteId}
            onRouteSelect={onRouteSelect}
            selectRef={routeSelectRef}
          />
        </div>
      )}
      {panelAnnouncement && (
        <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {panelAnnouncement}
        </p>
      )}
    </section>
  )
}
