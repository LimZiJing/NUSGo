/** Widest viewport, in CSS pixels, that uses the mobile layout by width alone. */
export const MOBILE_LAYOUT_MAX_WIDTH = 768
export const DESKTOP_LAYOUT_MIN_WIDTH = MOBILE_LAYOUT_MAX_WIDTH + 1
/** Upper width and height bounds for short coarse-pointer landscape layouts. */
export const SHORT_LANDSCAPE_MAX_WIDTH = 900
export const SHORT_LANDSCAPE_MAX_HEIGHT = 420
export const MOBILE_LAYOUT_MEDIA_QUERY = `(max-width: ${MOBILE_LAYOUT_MAX_WIDTH}px), (max-width: ${SHORT_LANDSCAPE_MAX_WIDTH}px) and (max-height: ${SHORT_LANDSCAPE_MAX_HEIGHT}px) and (pointer: coarse)`
export const DESKTOP_LAYOUT_MEDIA_QUERY = `(min-width: ${DESKTOP_LAYOUT_MIN_WIDTH}px) and (min-height: ${SHORT_LANDSCAPE_MAX_HEIGHT + 1}px), (min-width: ${SHORT_LANDSCAPE_MAX_WIDTH + 1}px), (min-width: ${DESKTOP_LAYOUT_MIN_WIDTH}px) and (pointer: fine), (min-width: ${DESKTOP_LAYOUT_MIN_WIDTH}px) and (pointer: none)`

export function isMobileLayoutWidth(viewportWidth: number): boolean {
  return viewportWidth <= MOBILE_LAYOUT_MAX_WIDTH
}
