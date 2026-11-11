/** Viewports at or below this width stay mobile, including landscape, to preserve map width. */
export const MOBILE_LAYOUT_NARROW_MAX_WIDTH = 640
/** Widest viewport, in CSS pixels, that uses the mobile layout by width alone. */
export const MOBILE_LAYOUT_MAX_WIDTH = 768
export const DESKTOP_LAYOUT_MIN_WIDTH = MOBILE_LAYOUT_MAX_WIDTH + 1
/** A short landscape viewport at or above this width uses the desktop side panel. */
export const SHORT_LANDSCAPE_MIN_WIDTH = MOBILE_LAYOUT_NARROW_MAX_WIDTH + 1
export const SHORT_LANDSCAPE_MAX_HEIGHT = 420
export const MOBILE_LAYOUT_MEDIA_QUERY = `(max-width: ${MOBILE_LAYOUT_NARROW_MAX_WIDTH}px), (max-width: ${MOBILE_LAYOUT_MAX_WIDTH}px) and (min-height: ${SHORT_LANDSCAPE_MAX_HEIGHT + 1}px)`
export const DESKTOP_LAYOUT_MEDIA_QUERY = `(min-width: ${DESKTOP_LAYOUT_MIN_WIDTH}px), (min-width: ${SHORT_LANDSCAPE_MIN_WIDTH}px) and (max-height: ${SHORT_LANDSCAPE_MAX_HEIGHT}px)`

export function isMobileLayoutWidth(viewportWidth: number): boolean {
  return viewportWidth <= MOBILE_LAYOUT_MAX_WIDTH
}
