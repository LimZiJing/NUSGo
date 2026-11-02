import { describe, expect, it, vi } from 'vitest'
import { createPublicBusArrivalClient } from './client'

describe('createPublicBusArrivalClient', () => {
  it('preserves a validated next service start from LTA arrivals', async () => {
    const nextStartAt = '2026-01-01T07:00:00+08:00'
    const client = createPublicBusArrivalClient({
      fetcher: async () => new Response(JSON.stringify({
        source: 'lta-datamall',
        observedAt: '2026-01-01T05:00:00+08:00',
        refreshedAt: '2026-01-01T05:00:00+08:00',
        expiresAt: '2026-01-01T05:01:00+08:00',
        stops: {
          'KR-MRT': {
            observedAt: '2026-01-01T05:00:00+08:00',
            expiresAt: '2026-01-01T05:01:00+08:00',
            services: {
              '151': { status: 'not-in-operation', arrivals: [], nextStartAt },
            },
          },
        },
      }), { status: 200 }),
      now: () => Date.parse('2026-01-01T05:00:00+08:00'),
    })

    const snapshot = await client.getArrivals(
      [{ stopId: 'KR-MRT', stopName: 'Kent Ridge MRT' }],
      new AbortController().signal,
    )

    expect(snapshot.stops['KR-MRT']?.services['151']?.nextStartAt).toBe(nextStartAt)
  })

  it('rejects an invalid next service start timestamp', async () => {
    const client = createPublicBusArrivalClient({
      fetcher: async () => new Response(JSON.stringify({
        source: 'lta-datamall',
        observedAt: '2026-01-01T05:00:00+08:00',
        refreshedAt: '2026-01-01T05:00:00+08:00',
        expiresAt: '2026-01-01T05:01:00+08:00',
        stops: {
          'KR-MRT': {
            observedAt: '2026-01-01T05:00:00+08:00',
            expiresAt: '2026-01-01T05:01:00+08:00',
            services: {
              '151': { status: 'not-in-operation', arrivals: [], nextStartAt: 'tomorrow at 5:30 AM' },
            },
          },
        },
      }), { status: 200 }),
      now: () => Date.parse('2026-01-01T05:00:00+08:00'),
    })

    await expect(client.getArrivals(
      [{ stopId: 'KR-MRT', stopName: 'Kent Ridge MRT' }],
      new AbortController().signal,
    )).rejects.toThrow('Live public bus arrival data could not be fetched')
  })

  it('requests arrivals from the configured API origin', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      source: 'lta-datamall',
      observedAt: '2026-09-23T13:48:26+08:00',
      refreshedAt: '2026-09-23T13:48:26+08:00',
      expiresAt: '2026-09-23T13:49:26+08:00',
      stops: {
        'KR-MRT': {
          observedAt: '2026-09-23T13:48:26+08:00',
          expiresAt: '2026-09-23T13:49:26+08:00',
          services: {},
        },
      },
    }), { status: 200 }))
    const client = createPublicBusArrivalClient({
      apiOrigin: 'https://api.example.test',
      fetcher,
      now: () => Date.parse('2026-09-23T13:48:30+08:00'),
    })

    await client.getArrivals(
      [{ stopId: 'KR-MRT', stopName: 'Kent Ridge MRT' }],
      new AbortController().signal,
    )

    const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://api.example.test')
    expect(requestUrl.pathname).toBe('/api/public-bus-arrivals')
    expect(JSON.parse(requestUrl.searchParams.get('stops') ?? '')).toEqual([
      { stopId: 'KR-MRT', stopName: 'Kent Ridge MRT' },
    ])
  })
})
