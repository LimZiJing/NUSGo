/** Widest viewport, in CSS pixels, that uses the mobile layout; desktop starts one pixel wider. */
export const MOBILE_LAYOUT_MAX_WIDTH = 768
export const MOBILE_LAYOUT_MEDIA_QUERY = `(max-width: ${MOBILE_LAYOUT_MAX_WIDTH}px)`
export const DESKTOP_LAYOUT_MIN_WIDTH = MOBILE_LAYOUT_MAX_WIDTH + 1

export function isMobileLayoutWidth(viewportWidth: number): boolean {
  return viewportWidth <= MOBILE_LAYOUT_MAX_WIDTH
}
