import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type MouseEvent,
} from 'react'
import type { VenueSearchResult } from '../../../domain/venue/search'
import type { VenueLocationMap } from '@navus/shared/venue/types'
import type { TransitIndex } from '../../../domain/transit'
import { GhostBackButton } from '../../../ui/ghost-back-button'
import { SegmentedControl } from '../../../ui/segmented-control'
import type { MobileSheetDetent } from '../../../ui/mobile/mobile-sheet/mobile-sheet-detent'
import type { ExploreMode, ExploreState } from '../state/explore-state'
import type { ExplorePanelStatus } from '../state/explore-panel-status'
import { BusRouteList } from './bus-route-list'
import { VenueDetails } from './venue-details'
import { VenueSearch } from './venue-search'
import '../styles/explore-content.css'

interface ExploreFocusTarget {
  readonly element: HTMLElement | null
  readonly key: string | null
  readonly fallbackKey: string | null
}
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
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
  transitIndex?: TransitIndex | null
  sheetDetent?: MobileSheetDetent
  mobileSheet?: boolean
  active?: boolean
  onRestore?: () => void
  onMinimize?: () => void
  status?: ExplorePanelStatus | null
  selectedRouteId?: string | null
  onRouteSelect: (routeId: string) => void
  onQueryChange: (query: string) => void
  onVenueSelect: (result: VenueSearchResult) => void
  onNavigateToVenue?: (venueCode: string) => void
  onOpenBusRoutes: () => void
  onLeaveMobileRoutes?: () => void
  onFocusStop?: (stopId: string, focusTarget?: HTMLElement) => void
  onBack: () => void
  onEscape: () => void
  onDismissMapPopup?: () => boolean
  onSearchFocus?: () => void
  onSearchCancel?: () => void
  onSearchResult?: () => void
}



function getExplorePanelHeading(state: ExploreState): string {
  if (state.mode === 'bus-routes') return EXPLORE_LABELS.busRoutes
  if (state.mode === 'venue-detail') return 'Venue details'
  return 'Find a venue'
}

function findExploreFocusTarget(key: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-focus-id]'))
    .find((element) => element.dataset.focusId === key)
}

function getExplorePanelAnnouncement(state: ExploreState): string | null {
  if (state.mode === 'bus-routes') return null
  if (state.mode === 'venue-detail' && state.selectedVenue) {
    return `Venue details opened for ${state.selectedVenue.code}.`
  }
  if (state.mode === 'venue-search') return 'Venue search opened.'
  if (state.mode === 'neutral') return 'Venue search opened.'
  return 'Map context closed.'
}



export function ExploreContent({
  state,
  venues,
  transitIndex = null,
  sheetDetent = 'partial',
  mobileSheet = true,
  active = true,
  onRestore,
  onMinimize,
  status,
  selectedRouteId = null,
  onRouteSelect,
  onQueryChange,
  onVenueSelect,
  onNavigateToVenue,
  onOpenBusRoutes,
  onLeaveMobileRoutes,
  onFocusStop,
  onBack,
  onEscape,
  onDismissMapPopup,
  onSearchFocus,
  onSearchCancel,
  onSearchResult,
}: ExploreContentProps) {
  const minimized = sheetDetent === 'collapsed'
  const busRoutesAvailable = (transitIndex?.routes.length ?? 0) > 0
  const explorePanelHeadingRef = useRef<HTMLHeadingElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const detailHeadingRef = useRef<HTMLHeadingElement>(null)
  const firstRouteCardRef = useRef<HTMLButtonElement>(null)
  const exploreFocusHistoryRef = useRef<ExploreFocusTarget[]>([])
  const pendingExploreFocusRef = useRef<ExploreFocusTarget | null>(null)
  const previousExploreModeRef = useRef<ExploreState['mode'] | null>(null)
  const previousMinimizedRef = useRef(minimized)
  const previousMobileSheetRef = useRef(mobileSheet)
  const previousActiveRef = useRef(active)
  const explorePanelHasFocusRef = useRef(false)
  const busRouteFocusPendingRef = useRef(false)
  const busRouteFocusMovedRef = useRef(false)
  const programmaticFocusRef = useRef(false)
  const pendingStopRowFocusRef = useRef<HTMLElement | null>(null)

  const focusElement = (element: HTMLElement | null): void => {
    if (!element) return
    programmaticFocusRef.current = true
    element.focus()
    programmaticFocusRef.current = false
  }

  const handleExploreFocusCapture = (): void => {
    explorePanelHasFocusRef.current = true
    if (
      state.mode === 'bus-routes' &&
      busRouteFocusPendingRef.current &&
      !programmaticFocusRef.current
    ) {
      busRouteFocusPendingRef.current = false
      busRouteFocusMovedRef.current = true
    }
  }

  const rememberExploreBackFocus = useCallback((): void => {
    pendingExploreFocusRef.current = exploreFocusHistoryRef.current.pop() ?? null
  }, [])

  const handleExploreBlurCapture = (event: FocusEvent<HTMLElement>): void => {
    const relatedTarget = event.relatedTarget
    if (relatedTarget && !event.currentTarget.contains(relatedTarget)) {
      explorePanelHasFocusRef.current = false
    }
  }


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
      if (state.mode === 'bus-routes') {
        exploreFocusHistoryRef.current = []
        pendingStopRowFocusRef.current = null
        pendingExploreFocusRef.current = {
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
          rememberExploreBackFocus()
          onEscape()
          return
        }
        onMinimize?.()
        return
      }
      rememberExploreBackFocus()
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
    rememberExploreBackFocus,
    state.mode,
  ])

  useIsomorphicLayoutEffect(() => {
    const wasActive = previousActiveRef.current
    previousActiveRef.current = active
    if (!active) {
      previousMinimizedRef.current = minimized
      previousMobileSheetRef.current = mobileSheet
      previousExploreModeRef.current = state.mode
      return
    }
    if (!wasActive) {
      previousMinimizedRef.current = minimized
      previousMobileSheetRef.current = mobileSheet
      previousExploreModeRef.current = state.mode
      return
    }

    const wasMinimized = previousMinimizedRef.current
    previousMinimizedRef.current = minimized
    const wasMobileSheet = previousMobileSheetRef.current
    previousMobileSheetRef.current = mobileSheet
    if (minimized) return
    if (wasMobileSheet !== mobileSheet && !wasMinimized) {
      previousExploreModeRef.current = state.mode
      return
    }

    const pendingFocus = pendingExploreFocusRef.current
    pendingExploreFocusRef.current = null
    const focusTarget = pendingFocus?.element?.isConnected
      ? pendingFocus.element
      : pendingFocus?.key
        ? findExploreFocusTarget(pendingFocus.key)
        : undefined
    const fallbackTarget = pendingFocus?.fallbackKey
      ? findExploreFocusTarget(pendingFocus.fallbackKey)
      : undefined
    const target = focusTarget ?? fallbackTarget
    if (target) {
      focusElement(target)
      previousExploreModeRef.current = state.mode
      return
    }

    if (wasMinimized) {
      if (state.mode === 'venue-search' || state.mode === 'neutral') {
        focusElement(searchInputRef.current)
      } else if (state.mode === 'venue-detail') {
        focusElement(detailHeadingRef.current)
      } else if (state.mode === 'bus-routes') {
        focusElement(firstRouteCardRef.current)
      } else {
        focusElement(explorePanelHeadingRef.current)
      }
      previousExploreModeRef.current = state.mode
      return
    }

    if (state.mode === 'venue-search') {
      focusElement(searchInputRef.current)
      previousExploreModeRef.current = state.mode
      return
    }
    if (state.mode === 'venue-detail') {
      focusElement(detailHeadingRef.current)
      previousExploreModeRef.current = state.mode
      return
    }
    if (state.mode === 'bus-routes') {
      const enteringBusRoutes = previousExploreModeRef.current !== 'bus-routes'
      const fallback = explorePanelHeadingRef.current

      if (enteringBusRoutes) {
        busRouteFocusPendingRef.current = true
        busRouteFocusMovedRef.current = false
      }

      if (enteringBusRoutes || (
        busRouteFocusPendingRef.current &&
        !busRouteFocusMovedRef.current &&
        document.activeElement === fallback
      )) {
        const routeCard = selectedRouteId
          ? findExploreFocusTarget(`bus-route-${selectedRouteId}`)
          : firstRouteCardRef.current
        if (routeCard instanceof HTMLButtonElement && !routeCard.disabled) {
          focusElement(routeCard)
          busRouteFocusPendingRef.current = false
        } else if (enteringBusRoutes) {
          focusElement(fallback)
        }
      }

      previousExploreModeRef.current = state.mode
      return
    }

    exploreFocusHistoryRef.current = []
    if (state.mode === 'neutral') {
      if (previousExploreModeRef.current !== null) focusElement(searchInputRef.current)
    } else {
      focusElement(explorePanelHeadingRef.current)
    }
    previousExploreModeRef.current = state.mode
  }, [
    active,
    minimized,
    mobileSheet,
    busRoutesAvailable,
    selectedRouteId,
    state.mode,
    state.selectedVenue?.code,
  ])

  const rememberCurrentControl = (
    event: MouseEvent<HTMLElement>,
    fallbackKey = state.mode === 'bus-routes' ? 'neutral-bus-routes-opener' : 'venue-search-opener',
  ): void => {
    exploreFocusHistoryRef.current.push({
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

  const handleBack = (): void => {
    rememberExploreBackFocus()
    onBack()
  }

  const handleSelectVenueSearch = (): void => {
    if (state.mode !== 'bus-routes') return
    exploreFocusHistoryRef.current = []
    pendingStopRowFocusRef.current = null
    pendingExploreFocusRef.current = {
      element: null,
      key: 'explore-venue-segment',
      fallbackKey: null,
    }
    onLeaveMobileRoutes?.()
  }

  const handleSelectBusRoutes = (event: MouseEvent<HTMLButtonElement>): void => {
    if (state.mode === 'bus-routes') return
    pendingExploreFocusRef.current = {
      element: event.currentTarget,
      key: 'explore-bus-routes-segment',
      fallbackKey: null,
    }
    exploreFocusHistoryRef.current.push({
      element: event.currentTarget,
      key: 'explore-bus-routes-segment',
      fallbackKey: null,
    })
    onOpenBusRoutes()
  }

  const handleFocusStop = (stopId: string, focusTarget?: HTMLElement): void => {
    const exploreReturnFocusTarget = focusTarget ?? (
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    )
    pendingStopRowFocusRef.current = exploreReturnFocusTarget
    onFocusStop?.(stopId, exploreReturnFocusTarget ?? undefined)
  }

  const explorePanelAnnouncement = getExplorePanelAnnouncement(state)
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
        onFocusCapture={handleExploreFocusCapture}
        onBlurCapture={handleExploreBlurCapture}
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
                if (mode === 'venue') handleSelectVenueSearch()
                else handleSelectBusRoutes(event)
              }}
            />
          )}
          {state.mode === 'venue-detail' && !minimized && (
            <GhostBackButton label={getVenueDetailReturnLabel(state)} onClick={handleBack} />
          )}
          <h2
            id="explore-content-heading"
            ref={explorePanelHeadingRef}
            tabIndex={-1}
            className={showExploreSegments || state.mode === 'venue-detail' ? 'visually-hidden' : undefined}
          >
            {getExplorePanelHeading(state)}
          </h2>
        </div>

        {(state.mode === 'venue-search' || state.mode === 'neutral') && (
          <VenueSearch
            query={state.query}
            venues={venues}
            minimized={minimized}
            inputRef={searchInputRef}
            onRestore={onRestore}
            onSearchFocus={onSearchFocus}
            onQueryChange={onQueryChange}
            onSelect={handleVenueSelect}
          />
        )}

        {state.mode === 'venue-detail' && state.selectedVenue && (
          <VenueDetails
            venue={state.selectedVenue}
            transitIndex={transitIndex}
            headingRef={detailHeadingRef}
            onNavigateToVenue={onNavigateToVenue}
            onFocusStop={handleFocusStop}
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
              onFocusStop={handleFocusStop}
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
