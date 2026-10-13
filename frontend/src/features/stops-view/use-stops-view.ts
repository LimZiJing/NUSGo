import { useEffect, useReducer } from 'react'
import type { TransitIndex } from '../../domain/transit'
import { readFavoriteStopIds, writeFavoriteStopIds } from './stop-favorites'
import { createInitialStopsState, stopsReducer } from './stops-state'

export function useStopsState(index: TransitIndex | null) {
  const [state, dispatch] = useReducer(
    stopsReducer,
    undefined,
    () => createInitialStopsState(readFavoriteStopIds()),
  )

  useEffect(() => {
    writeFavoriteStopIds(state.favoriteStopIds)
  }, [state.favoriteStopIds])

  useEffect(() => {
    if (!index) return
    dispatch({ type: 'reconcile-stops', stopIds: new Set(index.stops.map(({ id }) => id)) })
  }, [index])

  return [state, dispatch] as const
}
