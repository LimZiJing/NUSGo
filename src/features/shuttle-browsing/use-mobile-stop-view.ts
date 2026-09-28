import { useEffect, useReducer } from 'react'
import type { TransitIndex } from '../../domain/transit'
import { readFavoriteStopIds, writeFavoriteStopIds } from './mobile-stop-favorites'
import { createInitialMobileStopViewState, mobileStopViewReducer } from './mobile-stop-view'

export function useMobileStopView(index: TransitIndex | null) {
  const [view, dispatch] = useReducer(
    mobileStopViewReducer,
    undefined,
    () => createInitialMobileStopViewState(readFavoriteStopIds()),
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
