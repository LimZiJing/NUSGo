export interface MobileSheetHeights {
  readonly viewportHeight: number
  readonly partialMaxHeight: number
}

const PARTIAL_VIEWPORT_RATIO = 0.6

interface MobileTabBarBounds {
  readonly top: number
  readonly height: number
}

export function getMobileTabBarInset(
  shellBottom: number,
  tabBarBounds: MobileTabBarBounds | null,
  fallbackInset: number,
): number {
  const fallback = Number.isFinite(fallbackInset) ? Math.max(0, fallbackInset) : 0
  if (
    !tabBarBounds ||
    !Number.isFinite(shellBottom) ||
    !Number.isFinite(tabBarBounds.top) ||
    !Number.isFinite(tabBarBounds.height) ||
    tabBarBounds.height <= 0
  ) return fallback

  return Math.max(0, shellBottom - tabBarBounds.top)
}

export function getMobileSheetHeights(
  viewportHeight: number,
  tabBarInset: number,
): MobileSheetHeights {
  const visibleHeight = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0
  const visibleTabBarInset = Number.isFinite(tabBarInset) ? Math.max(0, tabBarInset) : 0
  const partialMaxHeight = Math.max(
    0,
    visibleHeight * PARTIAL_VIEWPORT_RATIO - visibleTabBarInset,
  )

  return {
    viewportHeight: visibleHeight,
    partialMaxHeight,
  }
}
