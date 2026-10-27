import type { Drawer } from '@base-ui/react/drawer'
import type { MobileSheetDetent } from './mobile-sheet-detent'

const PARTIAL_VIEWPORT_RATIO = 0.5
const SNAP_POINT_TOLERANCE_PX = 1

export type MobileSheetSnapPoints = readonly [
  collapsed: string,
  partial: string,
  full: string,
]

export function createMobileSheetSnapPoints(
  viewportHeight: number,
  tabBarInset: number,
  collapsedHeight: number,
  partialVisibleHeight?: number,
): MobileSheetSnapPoints {
  const visibleHeight = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0
  const visibleTabBarInset = Number.isFinite(tabBarInset) ? Math.max(0, tabBarInset) : 0
  const maximumHeight = visibleHeight
  // The viewport is clipped above the tab bar until the full detent is selected.
  // Include that inset in the lower snap points to preserve their visible heights.
  const collapsed = Math.min(
    maximumHeight,
    (Number.isFinite(collapsedHeight) ? Math.max(0, collapsedHeight) : 0) + visibleTabBarInset,
  )
  const requestedPartialHeight = partialVisibleHeight !== undefined && Number.isFinite(partialVisibleHeight)
    ? Math.max(0, partialVisibleHeight)
    : visibleHeight * PARTIAL_VIEWPORT_RATIO
  const partial = Math.max(
    collapsed,
    Math.min(maximumHeight, requestedPartialHeight + visibleTabBarInset),
  )

  return [`${collapsed}px`, `${partial}px`, `${maximumHeight}px`]
}

export function getMobileSheetSnapPoint(
  detent: MobileSheetDetent,
  snapPoints: MobileSheetSnapPoints,
): Drawer.Root.SnapPoint {
  if (detent === 'collapsed') return snapPoints[0]
  if (detent === 'partial') return snapPoints[1]
  return snapPoints[2]
}

function parseSnapPointPixels(snapPoint: Drawer.Root.SnapPoint): number | null {
  const pixels = typeof snapPoint === 'number'
    ? snapPoint
    : /^-?\d+(?:\.\d+)?(?:e-?\d+)?px$/i.test(snapPoint.trim())
      ? Number.parseFloat(snapPoint)
      : Number.NaN
  return Number.isFinite(pixels) ? pixels : null
}

// Base UI reports the snap point it settled on, which can differ from ours by
// sub-pixel rounding. A value from a different viewport size stays unmatched.
// Snap points are heights from the bottom of the map shell, so a detent's value is the part
// of the map it covers once settled. Use it instead of measuring a sheet that may still be moving.
export function getMobileSheetOccupiedHeight(
  detent: MobileSheetDetent,
  snapPoints: MobileSheetSnapPoints,
): number {
  return Number.parseFloat(getMobileSheetSnapPoint(detent, snapPoints) as string)
}

export function getMobileSheetDetent(
  snapPoint: Drawer.Root.SnapPoint | null,
  snapPoints: MobileSheetSnapPoints,
): MobileSheetDetent | null {
  if (snapPoint === null) return 'collapsed'
  const pixels = parseSnapPointPixels(snapPoint)
  if (pixels === null) return null

  const detents: readonly MobileSheetDetent[] = ['collapsed', 'partial', 'full']
  return detents.find((_, index) => (
    Math.abs(pixels - Number.parseFloat(snapPoints[index])) <= SNAP_POINT_TOLERANCE_PX
  )) ?? null
}
