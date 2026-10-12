interface MobileTabBarBounds {
  readonly top: number
  readonly height: number
}

// The inset includes the bottom gutter under the pill, so it is measured from
// the shell's bottom edge rather than taken from the tab bar's own height.
export function getMobileTabBarInset(
  shellBottom: number,
  tabBarBounds: MobileTabBarBounds | null,
): number {
  if (
    !tabBarBounds ||
    !Number.isFinite(shellBottom) ||
    !Number.isFinite(tabBarBounds.top) ||
    !Number.isFinite(tabBarBounds.height) ||
    tabBarBounds.height <= 0
  ) return 0

  return Math.max(0, shellBottom - tabBarBounds.top)
}
