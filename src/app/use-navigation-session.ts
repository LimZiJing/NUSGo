import { useSyncExternalStore } from 'react'
import {
  createInitialNavigationSessionState,
  type NavigationSession,
} from './navigation-session'

const EMPTY_STATE = createInitialNavigationSessionState()
const EMPTY_SUBSCRIBE = () => () => undefined
const getEmptyState = () => EMPTY_STATE

export function useNavigationSession(
  session: NavigationSession | null,
): ReturnType<NavigationSession['getState']> {
  return useSyncExternalStore(
    session ? (listener) => session.subscribe(listener) : EMPTY_SUBSCRIBE,
    session ? () => session.getState() : getEmptyState,
    session ? () => session.getState() : getEmptyState,
  )
}
