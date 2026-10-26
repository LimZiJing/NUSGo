import { describe, expect, it } from 'vitest'
import { createTransitIndex } from '../../../domain/transit'
import { createValidTransitNetwork } from '../../../domain/transit/test-fixtures'
import { getStopTimingData } from './stop-timing-data'

describe('stop timing data', () => {
  it('labels arrivals under 30 seconds as Arr and rounds 30 seconds up to 1m', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const stop = index.stopById.get('STOP-A')!
    const timingData = getStopTimingData(stop, index, {
      nowMs: Date.parse('2026-09-30T00:00:00.000Z'),
      arrivalSnapshot: {
        observedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-09-30T00:01:00.000Z',
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 29,
              upcomingArrivalSeconds: [29, 30, 59],
              headwaySeconds: null,
            },
          },
        },
      },
    })

    expect(timingData.departures[0]?.timings).toEqual(['Arr', '1m', '1m'])
  })
})
