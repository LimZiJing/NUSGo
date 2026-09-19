import { useSyncExternalStore } from 'react'
import {
  createInitialNavigationSessionState,
  type NavigationSession,
} from './navigation-session'

const EMPTY_STATE = createInitialNavigationSessionState()

export function useNavigationSession(
  session: NavigationSession | null,
) {
  return useSyncExternalStore(
    (listener) => session?.subscribe(listener) ?? (() => {}),
    () => session?.getState() ?? EMPTY_STATE,
    () => session?.getState() ?? EMPTY_STATE,
  )
}
