import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import type { NavigationSessionCommands } from '../navigation-session-mount'
import type { NavigationState, NavigationView } from '../navigation/navigation-state'
import type { MapViewportInsets } from '../map-camera'
import { applyMapOverlayMeasurements } from './map-insets-controller'
import { MAP_OVERLAY_MARGIN } from '../map-camera'
import { observeMobileSheetPresentation } from './mobile-sheet-presentation'
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
  readonly commands: Pick<NavigationSessionCommands, 'setViewportInsets' | 'setPresentationBottomInset'>
  readonly isMobileViewport: boolean
  readonly waypointPlacementActive?: boolean
  readonly navigation: NavigationState
  readonly mapShellRef: RefObject<HTMLElement | null>
  readonly mapPresentationRef: RefObject<HTMLElement | null>
  readonly sheetPortalContainer?: HTMLElement | null
  readonly tripControlsRef: RefObject<HTMLElement | null>
  readonly explorePanelRef: RefObject<HTMLElement | null>
  readonly stopsSheetRef: RefObject<HTMLElement | null>
  readonly mainNavigationRef: RefObject<HTMLElement | null>
  readonly navigationColumnRef: RefObject<HTMLElement | null>
  readonly onMeasurementsApplied?: () => void
  readonly observeStopsPresentation?: boolean
}

export interface MapOverlayLayout {
  readonly mobileSheetMetrics: MobileSheetMetrics | null
  readonly mapInsets: MapViewportInsets
  readonly navigationColumnWidth: number
}

function setStylePropertyIfChanged(element: HTMLElement, name: string, value: string): void {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value)
}

export function useMapOverlayLayout({
  commands,
  isMobileViewport,
  waypointPlacementActive = false,
  navigation,
  mapShellRef,
  mapPresentationRef,
  sheetPortalContainer,
  tripControlsRef,
  explorePanelRef,
  stopsSheetRef,
  mainNavigationRef,
  navigationColumnRef,
  onMeasurementsApplied,
  observeStopsPresentation = false,
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
    // Placement removes the measured tab bar, so remeasure only after navigation returns.
    if (!shell || !isMobileViewport || waypointPlacementActive) return

    let frame: number | null = null
    const updateVisualViewport = (): void => {
      const viewport = window.visualViewport
      const metrics = measureMobileSheetMetrics(shell, refs.mainNavigation.current)
      setStylePropertyIfChanged(shell, '--mobile-viewport-height', `${metrics.viewportHeight}px`)
      if (metrics.tabBarInset > 0) {
        setStylePropertyIfChanged(shell, '--mobile-tab-bar-height', `${metrics.tabBarInset}px`)
      }
      setStylePropertyIfChanged(shell, '--mobile-viewport-offset-top', `${viewport?.offsetTop ?? 0}px`)
      setMobileSheetMetrics((current) => (
        current && areMobileSheetMetricsEqual(current, metrics) ? current : metrics
      ))
    }

    const scheduleVisualViewportUpdate = (): void => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        updateVisualViewport()
      })
    }

    updateVisualViewport()
    window.addEventListener('resize', scheduleVisualViewportUpdate)
    window.visualViewport?.addEventListener('resize', scheduleVisualViewportUpdate)
    window.visualViewport?.addEventListener('scroll', scheduleVisualViewportUpdate)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleVisualViewportUpdate)
    resizeObserver?.observe(shell)
    if (refs.mainNavigation.current) resizeObserver?.observe(refs.mainNavigation.current)
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', scheduleVisualViewportUpdate)
      window.visualViewport?.removeEventListener('resize', scheduleVisualViewportUpdate)
      window.visualViewport?.removeEventListener('scroll', scheduleVisualViewportUpdate)
      resizeObserver?.disconnect()
      shell.style.removeProperty('--mobile-viewport-height')
      shell.style.removeProperty('--mobile-tab-bar-height')
      shell.style.removeProperty('--mobile-viewport-offset-top')
    }
  }, [isMobileViewport, refs, waypointPlacementActive])

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
    const shell = refs.mapShell.current
    const sheet = refs.stopsSheet.current
    const presentationTarget = mapPresentationRef.current
    if (!shell || !sheet || !presentationTarget || !isMobileViewport || !observeStopsPresentation) return
    return observeMobileSheetPresentation(
      shell,
      sheet,
      window,
      presentationTarget,
      commands.setPresentationBottomInset,
    )
  }, [commands, isMobileViewport, mapPresentationRef, observeStopsPresentation, refs, sheetElementsRevision])

  useLayoutEffect(() => {
    let frame: number | null = null
    const updateInsets = (publishPresentationInset = true): void => {
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
      const measuredNavigationWidth = isMobileViewport || waypointPlacementActive
        ? 0
        : refs.navigationColumn.current?.getBoundingClientRect().width ?? 0
      const metrics = mapShellElement
        ? measureMobileSheetMetrics(mapShellElement, refs.mainNavigation.current)
        : null
      const tabBarInset = waypointPlacementActive ? 0 : metrics?.tabBarInset ?? 0
      // A mobile sheet is sized from its detent: its bounds are still mid-transition when
      // the detent has only just changed, which would leave the map inset one step behind.
      const activeSheetHeight = waypointPlacementActive ? 0 : metrics && activeSheet?.classList.contains('mobile-sheet-popup')
        ? Math.max(0, getMobileSheetOccupiedHeight(
          navigation.sheets[activeView].detent,
          createMobileSheetSnapPoints(metrics.viewportHeight, tabBarInset, metrics.collapsedHeight),
        ) - tabBarInset)
        : activeSheetBounds?.height ?? 0
      // Read geometry before publishing state or map updates.
      const presentationBottomInset = publishPresentationInset && isMobileViewport && observeStopsPresentation && activeSheetBounds && mapShellElement
        ? Math.max(0, mapShellElement.getBoundingClientRect().bottom - activeSheetBounds.top + MAP_OVERLAY_MARGIN)
        : null
      setNavigationColumnWidth((current) => (
        current === measuredNavigationWidth ? current : measuredNavigationWidth
      ))
      // React applies the target detent before transitionrun. Hold the rendered
      // padding here so keyboard snaps cannot jump to the target for one frame.
      if (presentationBottomInset !== null) {
        commands.setPresentationBottomInset(presentationBottomInset)
      }
      const nextInsets = applyMapOverlayMeasurements(commands, {
        isMobileLayout: isMobileViewport,
        viewportWidth,
        viewportHeight,
        tripCardHeight: 0,
        activeSheetHeight: activeSheetHeight + tabBarInset,
        tripCardVisible: false,
        activeSheetVisible: isMobileViewport && !waypointPlacementActive,
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
    const scheduleInsetUpdate = (): void => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        updateInsets()
      })
    }
    const stopsSheet = refs.stopsSheet.current
    const finishPendingInsetUpdate = (event: TransitionEvent): void => {
      if (event.target !== stopsSheet || event.propertyName !== 'transform' || frame === null) return
      // The presentation observer clears its transient inset before this listener runs.
      // Preserve a queued viewport measurement without restoring the finished presentation.
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = null
        updateInsets(false)
      })
    }

    updateInsets()
    window.addEventListener('resize', scheduleInsetUpdate)
    window.visualViewport?.addEventListener('resize', scheduleInsetUpdate)
    window.visualViewport?.addEventListener('scroll', scheduleInsetUpdate)
    if (isMobileViewport && observeStopsPresentation && navigation.activeView === 'stops') {
      stopsSheet?.addEventListener('transitionend', finishPendingInsetUpdate)
    }
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleInsetUpdate)
    if (refs.tripControls.current) resizeObserver?.observe(refs.tripControls.current, { box: 'border-box' })
    if (refs.explorePanel.current) resizeObserver?.observe(refs.explorePanel.current, { box: 'border-box' })
    if (refs.stopsSheet.current) resizeObserver?.observe(refs.stopsSheet.current, { box: 'border-box' })
    if (refs.mainNavigation.current) resizeObserver?.observe(refs.mainNavigation.current, { box: 'border-box' })
    if (refs.navigationColumn.current) resizeObserver?.observe(refs.navigationColumn.current, { box: 'border-box' })

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', scheduleInsetUpdate)
      window.visualViewport?.removeEventListener('resize', scheduleInsetUpdate)
      window.visualViewport?.removeEventListener('scroll', scheduleInsetUpdate)
      stopsSheet?.removeEventListener('transitionend', finishPendingInsetUpdate)
      resizeObserver?.disconnect()
    }
  }, [
    commands,
    isMobileViewport,
    waypointPlacementActive,
    navigation.activeView,
    navigation.sheets,
    sheetPortalContainer,
    sheetElementsRevision,
    refs,
    onMeasurementsApplied,
    observeStopsPresentation,
  ])

  return { mobileSheetMetrics, mapInsets, navigationColumnWidth }
}
