import { describe, expect, it } from 'vitest'
import { createLiveShuttleWaitingTimeProvider } from './live-waiting'

const snapshot = {
  observedAt: '2026-09-23T13:48:26.000Z',
  expiresAt: '2026-09-23T13:49:26.000Z',
  stops: {
    PGP: {
      D2: {
        nextArrivalSeconds: 264,
        upcomingArrivalSeconds: [264, 624, 982],
        headwaySeconds: { min: 358, max: 480, median: 419 },
      },
    },
  },
} as const

const record = {
  routeId: 'D2',
  fromStopId: 'PGP',
  toStopId: 'UTOWN',
} as never

describe('createLiveShuttleWaitingTimeProvider', () => {
  it('uses the next arrival for the first boarding', () => {
    const waiting = createLiveShuttleWaitingTimeProvider(snapshot, Date.parse(snapshot.observedAt))

    expect(waiting(record, {
      routeId: 'D2',
      boardingStopId: 'PGP',
      elapsedSeconds: 0,
    })).toBe(264)
  })

  it('uses a future arrival for a transfer and half headway after the snapshot', () => {
    const waiting = createLiveShuttleWaitingTimeProvider(snapshot, Date.parse(snapshot.observedAt))

    expect(waiting(record, {
      routeId: 'D2',
      boardingStopId: 'PGP',
      elapsedSeconds: 300,
    })).toBe(324)
    expect(waiting(record, {
      routeId: 'D2',
      boardingStopId: 'PGP',
      elapsedSeconds: 1_100,
    })).toBe(210)
  })
})
