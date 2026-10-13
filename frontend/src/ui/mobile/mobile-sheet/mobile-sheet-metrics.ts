import { createContext } from 'react'
import { getMobileTabBarInset } from './mobile-sheet-layout'

export interface MobileSheetMetrics {
  readonly viewportHeight: number
  readonly tabBarInset: number
  readonly collapsedHeight: number
}

// Null until the app has measured the map shell; sheets then use fallback heights.
export const MobileSheetMetricsContext = createContext<MobileSheetMetrics | null>(null)

function readPixelVariable(styles: CSSStyleDeclaration, name: string): number | null {
  const value = Number.parseFloat(styles.getPropertyValue(name))
  return Number.isFinite(value) ? value : null
}

export function areMobileSheetMetricsEqual(a: MobileSheetMetrics, b: MobileSheetMetrics): boolean {
  return a.viewportHeight === b.viewportHeight &&
    a.tabBarInset === b.tabBarInset &&
    a.collapsedHeight === b.collapsedHeight
}

// The only place that measures the viewport, tab bar and handle size for the mobile
// sheets and the map insets, so both agree on the occupied bottom inset.
export function measureMobileSheetMetrics(
  mapShell: HTMLElement,
  tabBar: HTMLElement | null,
): MobileSheetMetrics {
  const tabBarBounds = tabBar?.getBoundingClientRect()
  const tabBarInset = getMobileTabBarInset(
    mapShell.getBoundingClientRect().bottom,
    tabBarBounds ? { top: tabBarBounds.top, height: tabBarBounds.height } : null,
  )
  const shellStyles = getComputedStyle(mapShell)
  const collapsedHeight = readPixelVariable(shellStyles, '--mobile-sheet-collapsed-height') ??
    (readPixelVariable(shellStyles, '--mobile-sheet-handle-row-height') ?? 0) +
      (readPixelVariable(shellStyles, '--mobile-sheet-handle-target-extension') ?? 0)

  return {
    viewportHeight: window.visualViewport?.height ?? window.innerHeight,
    tabBarInset,
    collapsedHeight,
  }
}
