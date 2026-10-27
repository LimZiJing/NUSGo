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

  it('shows the live times unavailable label and no departures for an unavailable stop', () => {
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
              nextArrivalSeconds: 120,
              upcomingArrivalSeconds: [120, 300, 480],
              headwaySeconds: null,
            },
          },
        },
        unavailableStopIds: ['STOP-A'],
      },
    })

    expect(timingData.liveArrivalMessage).toBe('Live times unavailable')
    expect(timingData.live).toBe(false)
    expect(timingData.departures).toEqual([])
    expect(timingData.scheduledDepartures).toEqual([])
  })

  it('keeps the LIVE pill for an unavailable shuttle stop when public bus times are live', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const stop = index.stopById.get('STOP-A')!
    const timingData = getStopTimingData(stop, index, {
      nowMs: Date.parse('2026-09-30T00:00:00.000Z'),
      arrivalSnapshot: {
        observedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-09-30T00:01:00.000Z',
        stops: {},
        unavailableStopIds: ['STOP-A'],
      },
      publicArrivalSnapshot: {
        source: 'lta-datamall',
        observedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-09-30T00:01:00.000Z',
        refreshedAt: '2026-09-30T00:00:00.000Z',
        stops: {
          'STOP-A': {
            observedAt: '2026-09-30T00:00:00.000Z',
            expiresAt: '2026-09-30T00:01:00.000Z',
            services: {
              '95': {
                status: 'live',
                arrivals: [{ estimatedAt: '2026-09-30T00:05:00.000Z', monitored: true }],
              },
            },
          },
        },
      },
    })

    expect(timingData.liveArrivalMessage).toBe('Live times unavailable')
    expect(timingData.departures).toEqual([])
    expect(timingData.live).toBe(true)
  })

  it('keeps live times and messages unchanged for a stop not in unavailableStopIds', () => {
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
              nextArrivalSeconds: 120,
              upcomingArrivalSeconds: [120, 300, 480],
              headwaySeconds: null,
            },
          },
        },
        unavailableStopIds: ['OTHER-STOP'],
      },
    })

    expect(timingData.liveArrivalMessage).toBeNull()
    expect(timingData.live).toBe(true)
    expect(timingData.departures[0]?.timings).toEqual(['2m', '5m', '8m'])
  })

  it('pins shuttle times to the poll, so a later clock does not count them down', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const stop = index.stopById.get('STOP-A')!
    const options = {
      arrivalSnapshot: {
        observedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-09-30T00:01:00.000Z',
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 100,
              upcomingArrivalSeconds: [100, 300, 480],
              headwaySeconds: null,
            },
          },
        },
      },
      arrivalSnapshotReceivedAtMs: Date.parse('2026-09-30T00:00:00.000Z'),
    }

    const atPoll = getStopTimingData(stop, index, {
      ...options,
      nowMs: Date.parse('2026-09-30T00:00:00.000Z'),
    })
    const beforeNextPoll = getStopTimingData(stop, index, {
      ...options,
      nowMs: Date.parse('2026-09-30T00:00:25.000Z'),
    })

    expect(atPoll.departures[0]?.timings).toEqual(['2m', '5m', '8m'])
    expect(beforeNextPoll.departures[0]?.timings).toEqual(['2m', '5m', '8m'])
  })

  it('keeps a late arrival at its last polled value instead of dropping it', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const stop = index.stopById.get('STOP-A')!
    const timingData = getStopTimingData(stop, index, {
      nowMs: Date.parse('2026-09-30T00:00:50.000Z'),
      arrivalSnapshot: {
        observedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-09-30T00:01:00.000Z',
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 20,
              upcomingArrivalSeconds: [20],
              headwaySeconds: null,
            },
          },
        },
      },
      arrivalSnapshotReceivedAtMs: Date.parse('2026-09-30T00:00:00.000Z'),
    })

    expect(timingData.departures[0]?.timings).toEqual(['Arr', '-', '-'])
  })

  it('subtracts the delay before the shuttle snapshot reached the client', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const stop = index.stopById.get('STOP-A')!
    const timingData = getStopTimingData(stop, index, {
      nowMs: Date.parse('2026-09-30T00:00:10.000Z'),
      arrivalSnapshot: {
        observedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-09-30T00:01:00.000Z',
        stops: {
          'STOP-A': {
            A1: {
              nextArrivalSeconds: 100,
              upcomingArrivalSeconds: [100],
              headwaySeconds: null,
            },
          },
        },
      },
      arrivalSnapshotReceivedAtMs: Date.parse('2026-09-30T00:00:10.000Z'),
    })

    expect(timingData.departures[0]?.timings).toEqual(['2m', '-', '-'])
  })

  it('pins public bus times to the poll and still expires stale snapshots on the clock', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const stop = index.stopById.get('STOP-A')!
    const publicArrivalSnapshot = {
      source: 'lta-datamall' as const,
      observedAt: '2026-09-30T00:00:00.000Z',
      expiresAt: '2026-09-30T00:01:00.000Z',
      refreshedAt: '2026-09-30T00:00:00.000Z',
      stops: {
        'STOP-A': {
          observedAt: '2026-09-30T00:00:00.000Z',
          expiresAt: '2026-09-30T00:01:00.000Z',
          services: {
            '95': {
              status: 'live' as const,
              arrivals: [{ estimatedAt: '2026-09-30T00:05:00.000Z', monitored: true }],
            },
          },
        },
      },
    }
    const options = {
      publicArrivalSnapshot,
      publicArrivalSnapshotReceivedAtMs: Date.parse('2026-09-30T00:00:00.000Z'),
    }

    const fresh = getStopTimingData(stop, index, {
      ...options,
      nowMs: Date.parse('2026-09-30T00:00:25.000Z'),
    })
    const stale = getStopTimingData(stop, index, {
      ...options,
      nowMs: Date.parse('2026-09-30T00:02:01.000Z'),
    })

    expect(fresh.publicServices[0]?.timings).toEqual(['5m', '-', '-'])
    expect(stale.publicServices[0]?.status).toBe('provider-error')
  })
})
