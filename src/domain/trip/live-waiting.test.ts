import { describe, expect, it } from 'vitest'
import { createLiveShuttleWaitingTimeProvider } from './live-waiting'

const snapshot = {
  observedAt: '2026-09-23T13:48:26.000Z',
  expiresAt: '2026-09-23T14:10:26.000Z',
  stops: {
    PGP: {
      D2: {
        nextArrivalSeconds: 264,
        upcomingArrivalSeconds: [264, 624, 982],
        headwaySeconds: { min: 358, max: 480, median: 419 },
      },
    },
  },
  stopObservations: {
    PGP: {
      observedAt: '2026-09-23T13:48:26.000Z',
      expiresAt: '2026-09-23T14:10:26.000Z',
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

  it('rejects an expired stop snapshot', () => {
    const waiting = createLiveShuttleWaitingTimeProvider(snapshot, Date.parse('2026-09-23T14:11:00.000Z'))

    expect(waiting(record, {
      routeId: 'D2',
      boardingStopId: 'PGP',
      elapsedSeconds: 0,
    })).toBeNull()
  })

  it('rejects a stale stop snapshot before its provider expiry', () => {
    const waiting = createLiveShuttleWaitingTimeProvider(
      snapshot,
      Date.parse('2026-09-23T13:49:12.000Z'),
    )

    expect(waiting(record, {
      routeId: 'D2',
      boardingStopId: 'PGP',
      elapsedSeconds: 0,
    })).toBeNull()
  })

  it('uses the boarding stop observation time for a mixed snapshot', () => {
    const mixedSnapshot = {
      ...snapshot,
      stopObservations: {
        PGP: {
          observedAt: '2026-09-23T13:48:26.000Z',
          expiresAt: '2026-09-23T14:10:26.000Z',
        },
        'KR-MRT': {
          observedAt: '2026-09-23T13:49:26.000Z',
          expiresAt: '2026-09-23T14:10:26.000Z',
        },
      },
      stops: {
        ...snapshot.stops,
        'KR-MRT': {
          D2: {
            nextArrivalSeconds: 60,
            upcomingArrivalSeconds: [60],
            headwaySeconds: null,
          },
        },
      },
    } as const
    const waiting = createLiveShuttleWaitingTimeProvider(
      mixedSnapshot,
      Date.parse('2026-09-23T13:49:26.000Z'),
    )

    expect(waiting(record, {
      routeId: 'D2',
      boardingStopId: 'KR-MRT',
      elapsedSeconds: 0,
    })).toBe(60)
  })
})
