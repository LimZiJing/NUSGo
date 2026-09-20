export interface MobileOverlayState {
  readonly tripExpanded: boolean
  readonly contextualPanelMinimized: boolean
}

export const MOBILE_LAYOUT_MEDIA_QUERY = '(max-width: 768px)'

export type MobileOverlayAction =
  | { readonly type: 'set-trip-expanded'; readonly expanded: boolean }
  | { readonly type: 'restore-contextual-panel' }
  | { readonly type: 'contextual-state-changed' }
  | { readonly type: 'viewport-changed'; readonly isMobile: boolean }

export function createInitialMobileOverlayState(): MobileOverlayState {
  return {
    tripExpanded: false,
    contextualPanelMinimized: false,
  }
}

export function getIsMobileViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches
}

export function subscribeToMobileViewport(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }

  const mediaQuery = window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY) as MediaQueryList & {
    addListener?: (listener: () => void) => void
    removeListener?: (listener: () => void) => void
  }
  const handleChange = (): void => listener()
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }

  mediaQuery.addListener?.(handleChange)
  return () => mediaQuery.removeListener?.(handleChange)
}

export function mobileOverlayReducer(
  state: MobileOverlayState,
  action: MobileOverlayAction,
): MobileOverlayState {
  switch (action.type) {
    case 'viewport-changed':
      if (
        !state.tripExpanded &&
        !state.contextualPanelMinimized &&
        !action.isMobile
      ) return state
      return {
        tripExpanded: false,
        contextualPanelMinimized: false,
      }
    case 'set-trip-expanded':
      if (
        state.tripExpanded === action.expanded &&
        state.contextualPanelMinimized === action.expanded
      ) return state
      return {
        tripExpanded: action.expanded,
        contextualPanelMinimized: action.expanded,
      }
    case 'restore-contextual-panel':
    case 'contextual-state-changed':
      if (!state.tripExpanded && !state.contextualPanelMinimized) return state
      return {
        tripExpanded: false,
        contextualPanelMinimized: false,
      }
  }
}
