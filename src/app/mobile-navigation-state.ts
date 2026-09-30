import type {
  MobileSheetDetent,
  OpenMobileSheetDetent,
} from '../ui/mobile-sheet-detent'
import type { MobileTab } from '../ui/mobile-tab'

export type { MobileSheetDetent } from '../ui/mobile-sheet-detent'
export type { MobileTab } from '../ui/mobile-tab'

interface MobileSheetSearchState {
  readonly returnDetent: OpenMobileSheetDetent
  readonly changedManually: boolean
}

export interface MobileTabSheetState {
  readonly detent: MobileSheetDetent
  readonly lastNonCollapsedDetent: OpenMobileSheetDetent
  readonly search: MobileSheetSearchState | null
}

export interface MobileNavigationState {
  readonly activeTab: MobileTab
  readonly sheets: Readonly<Record<MobileTab, MobileTabSheetState>>
}

export const MOBILE_LAYOUT_MEDIA_QUERY = '(max-width: 768px)'

export type MobileNavigationAction =
  | { readonly type: 'select-tab'; readonly tab: MobileTab }
  | { readonly type: 'open-plan' }
  | {
      readonly type: 'set-sheet-detent'
      readonly tab: MobileTab
      readonly detent: MobileSheetDetent
      readonly source?: 'manual' | 'programmatic'
    }
  | { readonly type: 'start-search'; readonly tab: MobileTab }
  | { readonly type: 'dismiss-search'; readonly tab: MobileTab }
  | { readonly type: 'select-search-result'; readonly tab: MobileTab }
  | { readonly type: 'close-active-tab' }

const initialSheetState: MobileTabSheetState = {
  detent: 'partial',
  lastNonCollapsedDetent: 'partial',
  search: null,
}

export function createInitialMobileNavigationState(): MobileNavigationState {
  return {
    activeTab: 'stops',
    sheets: {
      explore: initialSheetState,
      stops: initialSheetState,
      plan: initialSheetState,
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

function setSheetDetent(
  state: MobileNavigationState,
  tab: MobileTab,
  detent: MobileSheetDetent,
  source: 'manual' | 'programmatic' = 'programmatic',
): MobileNavigationState {
  const sheet = state.sheets[tab]
  const search = source === 'manual' && sheet.search
    ? { ...sheet.search, changedManually: true }
    : sheet.search
  const lastNonCollapsedDetent = detent === 'collapsed'
    ? sheet.lastNonCollapsedDetent
    : detent

  if (
    sheet.detent === detent &&
    sheet.lastNonCollapsedDetent === lastNonCollapsedDetent &&
    sheet.search === search
  ) return state

  return {
    ...state,
    sheets: {
      ...state.sheets,
      [tab]: { detent, lastNonCollapsedDetent, search },
    },
  }
}

function startSearch(state: MobileNavigationState, tab: MobileTab): MobileNavigationState {
  const sheet = state.sheets[tab]
  const search = sheet.search ?? {
    returnDetent: sheet.detent === 'collapsed'
      ? sheet.lastNonCollapsedDetent
      : sheet.detent,
    changedManually: false,
  }

  return {
    ...state,
    activeTab: tab,
    sheets: {
      ...state.sheets,
      [tab]: {
        ...sheet,
        detent: 'full',
        lastNonCollapsedDetent: sheet.lastNonCollapsedDetent,
        search,
      },
    },
  }
}

export function mobileNavigationReducer(
  state: MobileNavigationState,
  action: MobileNavigationAction,
): MobileNavigationState {
  switch (action.type) {
    case 'select-tab':
      if (state.activeTab !== action.tab) return { ...state, activeTab: action.tab }
      if (state.sheets[action.tab].detent !== 'collapsed') return state
      return setSheetDetent(state, action.tab, state.sheets[action.tab].lastNonCollapsedDetent)
    case 'open-plan':
      return setSheetDetent({ ...state, activeTab: 'plan' }, 'plan', 'partial')
    case 'set-sheet-detent':
      return setSheetDetent(state, action.tab, action.detent, action.source)
    case 'start-search':
      return startSearch(state, action.tab)
    case 'dismiss-search': {
      const sheet = state.sheets[action.tab]
      if (!sheet.search) return state
      const detent = sheet.search.changedManually
        ? sheet.detent
        : sheet.search.returnDetent
      return {
        ...state,
        sheets: {
          ...state.sheets,
          [action.tab]: {
            ...sheet,
            detent,
            lastNonCollapsedDetent: detent === 'collapsed'
              ? sheet.lastNonCollapsedDetent
              : detent,
            search: null,
          },
        },
      }
    }
    case 'select-search-result':
      return {
        ...state,
        sheets: {
          ...state.sheets,
          [action.tab]: {
            ...state.sheets[action.tab],
            detent: 'partial',
            lastNonCollapsedDetent: 'partial',
            search: null,
          },
        },
      }
    case 'close-active-tab':
      return setSheetDetent(state, state.activeTab, 'collapsed', 'manual')
  }
}
