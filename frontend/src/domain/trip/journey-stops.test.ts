import { describe, expect, it } from 'vitest'
import type { TransitRoute } from '@navus/shared/transit/types'
import type { ShuttleJourneyLeg } from './journey'
import { getShuttleJourneyLegStopIds } from './journey-stops'

const route: TransitRoute = {
  id: 'A1',
  name: 'A1',
  color: '#123456',
  stopIds: ['STOP-A', 'STOP-MIDDLE', 'STOP-B', 'STOP-AFTER'],
}

function createShuttleLeg(
  boardingStopId: string,
  alightingStopId: string,
): Pick<ShuttleJourneyLeg, 'routeId' | 'boardingStopId' | 'alightingStopId'> {
  return {
    routeId: 'A1',
    boardingStopId,
    alightingStopId,
  }
}

describe('getShuttleJourneyLegStopIds', () => {
  it('returns the inclusive ordered stop segment for a shuttle leg', () => {
    expect(getShuttleJourneyLegStopIds(
      createShuttleLeg('STOP-A', 'STOP-B'),
      route,
    )).toEqual(['STOP-A', 'STOP-MIDDLE', 'STOP-B'])
  })

  it('returns null when the Route or forward ordered segment cannot be resolved', () => {
    expect(getShuttleJourneyLegStopIds(createShuttleLeg('STOP-A', 'STOP-B'), null)).toBeNull()
    expect(getShuttleJourneyLegStopIds(createShuttleLeg('STOP-B', 'STOP-A'), route)).toBeNull()
    expect(getShuttleJourneyLegStopIds({
      ...createShuttleLeg('STOP-A', 'STOP-B'),
      routeId: 'B1',
    }, route)).toBeNull()
  })
})
