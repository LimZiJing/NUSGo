import type { Drawer } from '@base-ui/react/drawer'
import type { MobileSheetDetent } from './mobile-sheet-detent'
import { getMobileSheetHeights } from './mobile-sheet-layout'

export type BaseUiMobileSheetSnapPoints = readonly [
  collapsed: string,
  partial: string,
  full: string,
]

export type BaseUiMobileSheetDetentHeights = readonly [
  collapsed: number,
  partial: number,
  full: number,
]

export function createBaseUiMobileSheetSnapPointsFromHeights(
  heights: BaseUiMobileSheetDetentHeights,
): BaseUiMobileSheetSnapPoints {
  const toSnapPoint = (height: number): string => `${Math.max(0, Number.isFinite(height) ? height : 0)}px`
  return [toSnapPoint(heights[0]), toSnapPoint(heights[1]), toSnapPoint(heights[2])]
}

export function createBaseUiMobileSheetSnapPoints(
  viewportHeight: number,
  tabBarInset: number,
  collapsedHeight: number,
): BaseUiMobileSheetSnapPoints {
  const visibleHeight = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0
  const visibleTabBarInset = Number.isFinite(tabBarInset) ? Math.max(0, tabBarInset) : 0
  const maximumHeight = Math.max(0, visibleHeight - visibleTabBarInset)
  const collapsed = Math.min(
    maximumHeight,
    Number.isFinite(collapsedHeight) ? Math.max(0, collapsedHeight) : 0,
  )
  const partial = Math.max(
    collapsed,
    Math.min(maximumHeight, getMobileSheetHeights(visibleHeight, visibleTabBarInset).partialMaxHeight),
  )

  return createBaseUiMobileSheetSnapPointsFromHeights([collapsed, partial, maximumHeight])
}

export function getBaseUiMobileSheetSnapPoint(
  detent: MobileSheetDetent,
  snapPoints: BaseUiMobileSheetSnapPoints,
): Drawer.Root.SnapPoint {
  if (detent === 'collapsed') return snapPoints[0]
  if (detent === 'partial') return snapPoints[1]
  return snapPoints[2]
}

export function getBaseUiMobileSheetDetent(
  snapPoint: Drawer.Root.SnapPoint | null,
  snapPoints: BaseUiMobileSheetSnapPoints,
): MobileSheetDetent {
  if (snapPoint === null || Object.is(snapPoint, snapPoints[0])) return 'collapsed'
  if (Object.is(snapPoint, snapPoints[1])) return 'partial'
  return 'full'
}
