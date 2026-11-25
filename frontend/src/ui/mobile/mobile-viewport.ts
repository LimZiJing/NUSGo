import { isMobileLayout, MOBILE_LAYOUT_MEDIA_QUERY } from '../../domain/layout-breakpoint'

export function getIsMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia === 'function') return window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches
  return isMobileLayout(window.innerWidth, window.innerHeight)
}
