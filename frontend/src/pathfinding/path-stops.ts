import type { BusRoute } from '@navus/shared/transit/types'
import type { BusPathLeg } from './path'

export function getBusPathLegStopIds(
  leg: Pick<BusPathLeg, 'routeId' | 'boardingStopId' | 'alightingStopId'>,
  route: BusRoute | null,
): readonly string[] | null {
  if (!route || route.id !== leg.routeId) return null

  const boardingIndex = route.stopIds.indexOf(leg.boardingStopId)
  const alightingIndex = route.stopIds.indexOf(leg.alightingStopId)
  if (boardingIndex < 0 || alightingIndex < boardingIndex) return null

  return route.stopIds.slice(boardingIndex, alightingIndex + 1)
}
