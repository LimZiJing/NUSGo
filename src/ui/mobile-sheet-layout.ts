export interface MobileSheetHeights {
  readonly viewportHeight: number
  readonly combinedHeightCap: number
  readonly partialMaxHeight: number
  readonly partialMinHeight: number
}

const PARTIAL_VIEWPORT_RATIO = 0.4
const PARTIAL_SHEET_FLOOR = 200

export function getMobileSheetHeights(
  viewportHeight: number,
  tabBarHeight: number,
): MobileSheetHeights {
  const visibleHeight = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0
  const visibleTabBarHeight = Number.isFinite(tabBarHeight) ? Math.max(0, tabBarHeight) : 0
  const combinedHeightCap = visibleHeight * PARTIAL_VIEWPORT_RATIO
  const partialMaxHeight = Math.max(0, combinedHeightCap - visibleTabBarHeight)

  return {
    viewportHeight: visibleHeight,
    combinedHeightCap,
    partialMaxHeight,
    partialMinHeight: Math.min(PARTIAL_SHEET_FLOOR, partialMaxHeight),
  }
}
