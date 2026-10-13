import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import type { NavigationSessionCommands } from '../navigation-session-mount'
import type { NavigationState, NavigationView } from '../navigation/navigation-state'
import type { MapViewportInsets } from '../map-camera'
import { applyMapOverlayMeasurements } from './map-insets-controller'
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
  readonly exploreViewRef: RefObject<HTMLElement | null>
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
  exploreViewRef,
  stopsSheetRef,
  mainNavigationRef,
  navigationColumnRef,
  onMeasurementsApplied,
}: UseMapOverlayLayoutOptions): MapOverlayLayout {
  const refs = useMemo(() => ({
    mapShell: mapShellRef,
    tripControls: tripControlsRef,
    exploreView: exploreViewRef,
    stopsSheet: stopsSheetRef,
    mainNavigation: mainNavigationRef,
    navigationColumn: navigationColumnRef,
  }), [
    exploreViewRef,
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
    const updateInsets = (): void => {
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const activeView: NavigationView = navigation.activeView
      const activeSheet = activeView === 'plan'
        ? refs.tripControls.current
        : activeView === 'stops'
          ? refs.stopsSheet.current
          : refs.exploreView.current
      const activeSheetBounds = activeSheet?.getBoundingClientRect()
      const mapShellElement = refs.mapShell.current
      const mapShellBottom = mapShellElement?.getBoundingClientRect().bottom ?? viewportHeight
      const measuredNavigationWidth = isMobileViewport
        ? 0
        : refs.navigationColumn.current?.getBoundingClientRect().width ?? 0
      setNavigationColumnWidth((current) => (
        current === measuredNavigationWidth ? current : measuredNavigationWidth
      ))
      const tabBarInset = mapShellElement
        ? measureMobileSheetMetrics(mapShellElement, refs.mainNavigation.current).tabBarInset
        : 0
      const activeSheetHeight = activeSheet?.classList.contains('mobile-sheet-popup')
        ? Math.max(0, mapShellBottom - tabBarInset - (activeSheetBounds?.top ?? mapShellBottom))
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
    if (refs.exploreView.current) resizeObserver?.observe(refs.exploreView.current)
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
    navigation.sheets.explore.detent,
    navigation.sheets.plan.detent,
    navigation.sheets.stops.detent,
    sheetPortalContainer,
    refs,
    onMeasurementsApplied,
  ])

  return { mobileSheetMetrics, mapInsets, navigationColumnWidth }
}
