import type { TransitRoute } from '../transit/types'
import type { ShuttleJourneyLeg } from './journey'

export function getShuttleJourneyLegStopIds(
  leg: Pick<ShuttleJourneyLeg, 'routeId' | 'boardingStopId' | 'alightingStopId'>,
  route: TransitRoute | null,
): readonly string[] | null {
  if (!route || route.id !== leg.routeId) return null

  const boardingIndex = route.stopIds.indexOf(leg.boardingStopId)
  const alightingIndex = route.stopIds.indexOf(leg.alightingStopId)
  if (boardingIndex < 0 || alightingIndex < boardingIndex) return null

  return route.stopIds.slice(boardingIndex, alightingIndex + 1)
}
