import { useEffect, useReducer } from 'react'
import type { TransitIndex } from '../../domain/transit'
import { readFavoriteStopIds, writeFavoriteStopIds } from './stop-favorites'
import { createInitialStopsViewState, stopsViewReducer } from './stops-view-state'

export function useStopsView(index: TransitIndex | null) {
  const [view, dispatch] = useReducer(
    stopsViewReducer,
    undefined,
    () => createInitialStopsViewState(readFavoriteStopIds()),
  )

  useEffect(() => {
    writeFavoriteStopIds(view.favoriteStopIds)
  }, [view.favoriteStopIds])

  useEffect(() => {
    if (!index) return
    dispatch({ type: 'reconcile-stops', stopIds: new Set(index.stops.map(({ id }) => id)) })
  }, [index])

  return [view, dispatch] as const
}
