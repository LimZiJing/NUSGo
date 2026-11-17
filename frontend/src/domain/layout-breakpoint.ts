/** Viewports at or below this width stay mobile, including landscape, to preserve map width. */
export const MOBILE_LAYOUT_NARROW_MAX_WIDTH = 640
/** Maximum width for the mobile layout when the viewport is taller than the short-landscape cutoff. */
export const MOBILE_LAYOUT_MAX_WIDTH = 768
export const SHORT_LANDSCAPE_MAX_HEIGHT = 420
export const MOBILE_LAYOUT_MEDIA_QUERY =
  '(width <= ' + MOBILE_LAYOUT_NARROW_MAX_WIDTH + 'px), ' +
  '(width <= ' + MOBILE_LAYOUT_MAX_WIDTH + 'px) and (height > ' + SHORT_LANDSCAPE_MAX_HEIGHT + 'px)'
export const DESKTOP_LAYOUT_MEDIA_QUERY =
  '(width > ' + MOBILE_LAYOUT_MAX_WIDTH + 'px), ' +
  '(width > ' + MOBILE_LAYOUT_NARROW_MAX_WIDTH + 'px) and (height <= ' + SHORT_LANDSCAPE_MAX_HEIGHT + 'px)'

export function isMobileLayout(viewportWidth: number, viewportHeight: number): boolean {
  return viewportWidth <= MOBILE_LAYOUT_NARROW_MAX_WIDTH ||
    (viewportWidth <= MOBILE_LAYOUT_MAX_WIDTH && viewportHeight > SHORT_LANDSCAPE_MAX_HEIGHT)
}
