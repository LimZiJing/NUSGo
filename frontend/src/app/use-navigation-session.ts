import { useCallback, useSyncExternalStore } from 'react'
import {
  createInitialNavigationSessionState,
  type NavigationSession,
} from './navigation-session'

const EMPTY_STATE = createInitialNavigationSessionState()
export function useNavigationSession(
  session: NavigationSession | null,
): ReturnType<NavigationSession['getState']> {
  const subscribe = useCallback(
    (listener: () => void) => session?.subscribe(listener) ?? (() => undefined),
    [session],
  )
  const getSnapshot = useCallback(
    () => session?.getState() ?? EMPTY_STATE,
    [session],
  )

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  )
}
