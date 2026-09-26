import type { MobileTab } from '../ui/mobile-tab'

export type { MobileTab } from '../ui/mobile-tab'

export interface MobileNavigationState {
  readonly activeTab: MobileTab
  readonly sheets: Readonly<Record<MobileTab, { readonly expanded: boolean }>>
}

export const MOBILE_LAYOUT_MEDIA_QUERY = '(max-width: 768px)'

export type MobileNavigationAction =
  | { readonly type: 'select-tab'; readonly tab: MobileTab }
  | { readonly type: 'open-plan' }
  | { readonly type: 'set-sheet-expanded'; readonly tab: MobileTab; readonly expanded: boolean }
  | { readonly type: 'close-active-tab' }

export function createInitialMobileNavigationState(): MobileNavigationState {
  return {
    activeTab: 'explore',
    sheets: {
      explore: { expanded: true },
      stops: { expanded: false },
      plan: { expanded: true },
    },
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

export function mobileNavigationReducer(
  state: MobileNavigationState,
  action: MobileNavigationAction,
): MobileNavigationState {
  switch (action.type) {
    case 'select-tab':
      return state.activeTab === action.tab
        ? state
        : { ...state, activeTab: action.tab }
    case 'open-plan':
      if (state.activeTab === 'plan' && state.sheets.plan.expanded) return state
      return {
        ...state,
        activeTab: 'plan',
        sheets: {
          ...state.sheets,
          plan: { expanded: true },
        },
      }
    case 'set-sheet-expanded':
      if (state.sheets[action.tab].expanded === action.expanded) return state
      return {
        ...state,
        sheets: {
          ...state.sheets,
          [action.tab]: { expanded: action.expanded },
        },
      }
    case 'close-active-tab':
      if (!state.sheets[state.activeTab].expanded) return state
      return {
        ...state,
        sheets: {
          ...state.sheets,
          [state.activeTab]: { expanded: false },
        },
      }
  }
}
