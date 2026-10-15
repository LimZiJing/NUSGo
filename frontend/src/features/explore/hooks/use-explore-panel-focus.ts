import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type RefObject,
} from 'react'
import type { VenueSearchResult } from '../../../domain/venue/search'
import type { MobileSheetDetent } from '../../../ui/mobile/mobile-sheet/mobile-sheet-detent'
import type { ExploreState } from '../state/explore-state'

interface ExploreFocusTarget {
  readonly element: HTMLElement | null
  readonly key: string | null
  readonly fallbackKey: string | null
}

export interface ExplorePanelFocusOptions {
  readonly state: ExploreState
  readonly selectedRouteId: string | null
  readonly sheetDetent: MobileSheetDetent
  readonly mobileSheet: boolean
  readonly active: boolean
  readonly busRoutesAvailable: boolean
  readonly onVenueSelect: (result: VenueSearchResult) => void
  readonly onBuildingSelect?: (buildingId: string) => void
  readonly onOpenBusRoutes: () => void
  readonly onLeaveMobileRoutes?: () => void
  readonly onFocusStop?: (stopId: string, focusTarget?: HTMLElement) => void
  readonly onBack: () => void
  readonly onEscape: () => void
  readonly onMinimize?: () => void
  readonly onDismissMapPopup?: () => boolean
  readonly onSearchCancel?: () => void
  readonly onSearchResult?: () => void
}

export interface ExplorePanelFocusBindings {
  readonly panelHeadingRef: RefObject<HTMLHeadingElement | null>
  readonly searchInputRef: RefObject<HTMLInputElement | null>
  readonly detailHeadingRef: RefObject<HTMLHeadingElement | null>
  readonly firstRouteCardRef: RefObject<HTMLButtonElement | null>
  readonly onFocusCapture: () => void
  readonly onVenueSelect: (
    result: VenueSearchResult,
    event: MouseEvent<HTMLButtonElement>,
  ) => void
  readonly onBuildingSelect: (
    buildingId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) => void
  readonly onBack: () => void
  readonly onSelectVenueSearch: () => void
  readonly onSelectBusRoutes: (event: MouseEvent<HTMLButtonElement>) => void
  readonly onFocusStop: (stopId: string, focusTarget?: HTMLElement) => void
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function findExploreFocusTarget(key: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-focus-id]'))
    .find((element) => element.dataset.focusId === key)
}

export function useExplorePanelFocus({
  state,
  selectedRouteId,
  sheetDetent,
  mobileSheet,
  active,
  busRoutesAvailable,
  onVenueSelect,
  onBuildingSelect,
  onOpenBusRoutes,
  onLeaveMobileRoutes,
  onFocusStop,
  onBack,
  onEscape,
  onMinimize,
  onDismissMapPopup,
  onSearchCancel,
  onSearchResult,
}: ExplorePanelFocusOptions): ExplorePanelFocusBindings {
  const minimized = sheetDetent === 'collapsed'
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const detailHeadingRef = useRef<HTMLHeadingElement>(null)
  const firstRouteCardRef = useRef<HTMLButtonElement>(null)
  const exploreFocusHistoryRef = useRef<ExploreFocusTarget[]>([])
  const pendingExploreFocusRef = useRef<ExploreFocusTarget | null>(null)
  const previousExploreModeRef = useRef<ExploreState['mode'] | null>(null)
  const previousMinimizedRef = useRef(minimized)
  const previousMobileSheetRef = useRef(mobileSheet)
  const previousActiveRef = useRef(active)
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

  useEffect(() => {
    if (!active) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Give an open map popup the first Escape press before changing the Explore view.
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

    // Keep the clicked element when it survives the view change.
    // Use its stable key as a fallback when the element was unmounted.
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
        focusElement(panelHeadingRef.current)
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
      const fallback = panelHeadingRef.current

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
      focusElement(panelHeadingRef.current)
    }
    previousExploreModeRef.current = state.mode
  // Route data can arrive after the user opens Bus routes, so retry pending focus when cards become available.
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

  const handleBuildingSelect = (
    buildingId: string,
    event: MouseEvent<HTMLButtonElement>,
  ): void => {
    rememberCurrentControl(event, 'venue-search-opener')
    onSearchResult?.()
    onBuildingSelect?.(buildingId)
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

  return {
    panelHeadingRef,
    searchInputRef,
    detailHeadingRef,
    firstRouteCardRef,
    onFocusCapture: handleExploreFocusCapture,
    onVenueSelect: handleVenueSelect,
    onBuildingSelect: handleBuildingSelect,
    onBack: handleBack,
    onSelectVenueSearch: handleSelectVenueSearch,
    onSelectBusRoutes: handleSelectBusRoutes,
    onFocusStop: handleFocusStop,
  }
}
