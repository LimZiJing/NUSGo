import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import type { NavigationSessionCommands } from '../navigation-session-mount'
import type { NavigationState, NavigationView } from '../navigation/navigation-state'
import type { MapViewportInsets } from '../map-camera'
import { applyMapOverlayMeasurements } from './map-insets-controller'
import {
  createMobileSheetSnapPoints,
  getMobileSheetOccupiedHeight,
} from '../../ui/mobile/mobile-sheet/mobile-sheet-snap-points'
import {
  areMobileSheetMetricsEqual,
  measureMobileSheetMetrics,
  type MobileSheetMetrics,
} from '../../ui/mobile/mobile-sheet/mobile-sheet-metrics'

export interface UseMapOverlayLayoutOptions {
  readonly commands: Pick<NavigationSessionCommands, 'setViewportInsets'>
  readonly isMobileViewport: boolean
  readonly navigation: NavigationState
  readonly mapShellRef: RefObject<HTMLElement | null>
  readonly sheetPortalContainer?: HTMLElement | null
  readonly tripControlsRef: RefObject<HTMLElement | null>
  readonly explorePanelRef: RefObject<HTMLElement | null>
  readonly stopsSheetRef: RefObject<HTMLElement | null>
  readonly mainNavigationRef: RefObject<HTMLElement | null>
  readonly navigationColumnRef: RefObject<HTMLElement | null>
  readonly onMeasurementsApplied?: () => void
}

export interface MapOverlayLayout {
  readonly mobileSheetMetrics: MobileSheetMetrics | null
  readonly mapInsets: MapViewportInsets
  readonly navigationColumnWidth: number
}

export function useMapOverlayLayout({
  commands,
  isMobileViewport,
  navigation,
  mapShellRef,
  sheetPortalContainer,
  tripControlsRef,
  explorePanelRef,
  stopsSheetRef,
  mainNavigationRef,
  navigationColumnRef,
  onMeasurementsApplied,
}: UseMapOverlayLayoutOptions): MapOverlayLayout {
  const refs = useMemo(() => ({
    mapShell: mapShellRef,
    tripControls: tripControlsRef,
    explorePanel: explorePanelRef,
    stopsSheet: stopsSheetRef,
    mainNavigation: mainNavigationRef,
    navigationColumn: navigationColumnRef,
  }), [
    explorePanelRef,
    mainNavigationRef,
    mapShellRef,
    navigationColumnRef,
    stopsSheetRef,
    tripControlsRef,
  ])
  const [navigationColumnWidth, setNavigationColumnWidth] = useState(0)
  const [mobileSheetMetrics, setMobileSheetMetrics] = useState<MobileSheetMetrics | null>(null)
  const [mapInsets, setMapInsets] = useState<MapViewportInsets>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  })
  const [sheetElementsRevision, setSheetElementsRevision] = useState(0)

  useLayoutEffect(() => {
    const shell = refs.mapShell.current
    if (!shell || !isMobileViewport) return

    const updateVisualViewport = (): void => {
      const viewport = window.visualViewport
      const metrics = measureMobileSheetMetrics(shell, refs.mainNavigation.current)
      shell.style.setProperty('--mobile-viewport-height', `${metrics.viewportHeight}px`)
      if (metrics.tabBarInset > 0) {
        shell.style.setProperty('--mobile-tab-bar-height', `${metrics.tabBarInset}px`)
      }
      shell.style.setProperty('--mobile-viewport-offset-top', `${viewport?.offsetTop ?? 0}px`)
      setMobileSheetMetrics((current) => (
        current && areMobileSheetMetricsEqual(current, metrics) ? current : metrics
      ))
    }

    updateVisualViewport()
    window.addEventListener('resize', updateVisualViewport)
    window.visualViewport?.addEventListener('resize', updateVisualViewport)
    window.visualViewport?.addEventListener('scroll', updateVisualViewport)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateVisualViewport)
    resizeObserver?.observe(shell)
    if (refs.mainNavigation.current) resizeObserver?.observe(refs.mainNavigation.current)
    return () => {
      window.removeEventListener('resize', updateVisualViewport)
      window.visualViewport?.removeEventListener('resize', updateVisualViewport)
      window.visualViewport?.removeEventListener('scroll', updateVisualViewport)
      resizeObserver?.disconnect()
      shell.style.removeProperty('--mobile-viewport-height')
      shell.style.removeProperty('--mobile-tab-bar-height')
      shell.style.removeProperty('--mobile-viewport-offset-top')
    }
  }, [isMobileViewport, refs])

  useLayoutEffect(() => {
    const shell = refs.mapShell.current
    if (!shell || !isMobileViewport || typeof MutationObserver === 'undefined') return

    // Sheet popups are portalled into the map shell and can mount after the first measurement.
    // Nothing else re-runs the inset effect then, so bump a revision when a sheet element changes.
    const sheetElements = (): (HTMLElement | null)[] => [
      refs.tripControls.current,
      refs.explorePanel.current,
      refs.stopsSheet.current,
    ]
    const known = { elements: sheetElements() }
    const observer = new MutationObserver(() => {
      const current = sheetElements()
      if (current.every((element, index) => element === known.elements[index])) return
      known.elements = current
      setSheetElementsRevision((revision) => revision + 1)
    })
    observer.observe(shell, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [isMobileViewport, refs])

  useLayoutEffect(() => {
    const updateInsets = (): void => {
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const activeView: NavigationView = navigation.activeView
      const activeSheet = activeView === 'plan'
        ? refs.tripControls.current
        : activeView === 'stops'
          ? refs.stopsSheet.current
          : refs.explorePanel.current
      const activeSheetBounds = activeSheet?.getBoundingClientRect()
      const mapShellElement = refs.mapShell.current
      const measuredNavigationWidth = isMobileViewport
        ? 0
        : refs.navigationColumn.current?.getBoundingClientRect().width ?? 0
      setNavigationColumnWidth((current) => (
        current === measuredNavigationWidth ? current : measuredNavigationWidth
      ))
      const metrics = mapShellElement
        ? measureMobileSheetMetrics(mapShellElement, refs.mainNavigation.current)
        : null
      const tabBarInset = metrics?.tabBarInset ?? 0
      // A mobile sheet is sized from its detent: its bounds are still mid-transition when
      // the detent has only just changed, which would leave the map inset one step behind.
      const activeSheetHeight = metrics && activeSheet?.classList.contains('mobile-sheet-popup')
        ? Math.max(0, getMobileSheetOccupiedHeight(
          navigation.sheets[activeView].detent,
          createMobileSheetSnapPoints(metrics.viewportHeight, tabBarInset, metrics.collapsedHeight),
        ) - tabBarInset)
        : activeSheetBounds?.height ?? 0
      const nextInsets = applyMapOverlayMeasurements(commands, {
        viewportWidth,
        viewportHeight,
        tripCardHeight: 0,
        activeSheetHeight: activeSheetHeight + tabBarInset,
        tripCardVisible: false,
        activeSheetVisible: isMobileViewport,
        desktopNavigationWidth: measuredNavigationWidth,
      })
      setMapInsets((current) => (
        current.top === nextInsets.top &&
        current.right === nextInsets.right &&
        current.bottom === nextInsets.bottom &&
        current.left === nextInsets.left
          ? current
          : nextInsets
      ))
      onMeasurementsApplied?.()
    }

    updateInsets()
    window.addEventListener('resize', updateInsets)
    window.visualViewport?.addEventListener('resize', updateInsets)
    window.visualViewport?.addEventListener('scroll', updateInsets)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateInsets)
    if (refs.tripControls.current) resizeObserver?.observe(refs.tripControls.current)
    if (refs.explorePanel.current) resizeObserver?.observe(refs.explorePanel.current)
    if (refs.stopsSheet.current) resizeObserver?.observe(refs.stopsSheet.current)
    if (refs.mainNavigation.current) resizeObserver?.observe(refs.mainNavigation.current)
    if (refs.navigationColumn.current) resizeObserver?.observe(refs.navigationColumn.current)

    return () => {
      window.removeEventListener('resize', updateInsets)
      window.visualViewport?.removeEventListener('resize', updateInsets)
      window.visualViewport?.removeEventListener('scroll', updateInsets)
      resizeObserver?.disconnect()
    }
  }, [
    commands,
    isMobileViewport,
    navigation.activeView,
    navigation.sheets,
    sheetPortalContainer,
    sheetElementsRevision,
    refs,
    onMeasurementsApplied,
  ])

  return { mobileSheetMetrics, mapInsets, navigationColumnWidth }
}
