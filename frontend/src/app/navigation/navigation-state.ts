import type {
  MobileSheetDetent,
  OpenMobileSheetDetent,
} from '../../ui/mobile/mobile-sheet/mobile-sheet-detent'
import type { NavigationView } from '../../ui/navigation-view'
import { MOBILE_LAYOUT_MEDIA_QUERY } from '../../domain/layout-breakpoint'

export type { MobileSheetDetent } from '../../ui/mobile/mobile-sheet/mobile-sheet-detent'
export type { NavigationView } from '../../ui/navigation-view'

interface NavigationSheetSearchState {
  readonly returnDetent: OpenMobileSheetDetent
  readonly changedManually: boolean
}

export interface NavigationSheetState {
  readonly detent: MobileSheetDetent
  readonly lastNonCollapsedDetent: OpenMobileSheetDetent
  readonly search: NavigationSheetSearchState | null
}

export interface NavigationState {
  readonly activeView: NavigationView
  readonly sheets: Readonly<Record<NavigationView, NavigationSheetState>>
}

export type NavigationAction =
  | { readonly type: 'select-view'; readonly view: NavigationView }
  | { readonly type: 'activate-plan-from-map' }
  | { readonly type: 'open-plan' }
  | {
      readonly type: 'set-sheet-detent'
      readonly view: NavigationView
      readonly detent: MobileSheetDetent
      readonly source?: 'manual' | 'programmatic'
    }
  | { readonly type: 'start-search'; readonly view: NavigationView }
  | { readonly type: 'dismiss-search'; readonly view: NavigationView }
  | { readonly type: 'select-search-result'; readonly view: NavigationView }
  | { readonly type: 'close-active-view' }

const initialSheetState: NavigationSheetState = {
  detent: 'partial',
  lastNonCollapsedDetent: 'partial',
  search: null,
}

export function createInitialNavigationState(): NavigationState {
  return {
    activeView: 'stops',
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
  state: NavigationState,
  view: NavigationView,
  detent: MobileSheetDetent,
  source: 'manual' | 'programmatic' = 'programmatic',
): NavigationState {
  const sheet = state.sheets[view]
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
      [view]: { detent, lastNonCollapsedDetent, search },
    },
  }
}

function startSearch(state: NavigationState, view: NavigationView): NavigationState {
  const sheet = state.sheets[view]
  const search = sheet.search ?? {
    returnDetent: sheet.detent === 'collapsed'
      ? sheet.lastNonCollapsedDetent
      : sheet.detent,
    changedManually: false,
  }

  return {
    ...state,
    activeView: view,
    sheets: {
      ...state.sheets,
      [view]: {
        ...sheet,
        detent: 'full',
        lastNonCollapsedDetent: sheet.lastNonCollapsedDetent,
        search,
      },
    },
  }
}

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'select-view':
      if (state.activeView !== action.view) return { ...state, activeView: action.view }
      if (state.sheets[action.view].detent !== 'collapsed') return state
      return setSheetDetent(state, action.view, state.sheets[action.view].lastNonCollapsedDetent)
    case 'activate-plan-from-map': {
      if (state.activeView === 'plan') return state
      const planActive = { ...state, activeView: 'plan' as const }
      const planSheet = state.sheets.plan
      return planSheet.detent === 'collapsed'
        ? setSheetDetent(planActive, 'plan', planSheet.lastNonCollapsedDetent)
        : planActive
    }
    case 'open-plan':
      return setSheetDetent({ ...state, activeView: 'plan' }, 'plan', 'partial')
    case 'set-sheet-detent':
      return setSheetDetent(state, action.view, action.detent, action.source)
    case 'start-search':
      return startSearch(state, action.view)
    case 'dismiss-search': {
      const sheet = state.sheets[action.view]
      if (!sheet.search) return state
      const detent = sheet.search.changedManually
        ? sheet.detent
        : sheet.search.returnDetent
      return {
        ...state,
        sheets: {
          ...state.sheets,
          [action.view]: {
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
          [action.view]: {
            ...state.sheets[action.view],
            detent: 'partial',
            lastNonCollapsedDetent: 'partial',
            search: null,
          },
        },
      }
    case 'close-active-view':
      return setSheetDetent(state, state.activeView, 'collapsed', 'manual')
  }
}
