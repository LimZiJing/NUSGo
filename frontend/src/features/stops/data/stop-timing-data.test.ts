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

    expect(timingData.departures[0]?.timings).toEqual(['Arr', '1′', '1′'])
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
    expect(timingData.departures[0]?.timings).toEqual(['2′', '5′', '8′'])
  })

  it('applies the selected format to shuttle and public arrivals', () => {
    const index = createTransitIndex(createValidTransitNetwork())
    const stop = index.stopById.get('STOP-A')!
    const timingData = getStopTimingData(stop, index, {
      minuteFormat: 'min',
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
                arrivals: [{ estimatedAt: '2026-09-30T00:03:00.000Z', monitored: true }],
              },
            },
          },
        },
      },
    })

    expect(timingData.departures[0]?.timings).toEqual(['2 min', '5 min', '8 min'])
    expect(timingData.publicServices[0]?.timings).toEqual(['3 min', '-', '-'])
  })
})
