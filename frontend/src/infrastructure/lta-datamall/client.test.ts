import { describe, expect, it, vi } from 'vitest'
import { createPublicBusArrivalClient } from './client'

describe('createPublicBusArrivalClient', () => {
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
