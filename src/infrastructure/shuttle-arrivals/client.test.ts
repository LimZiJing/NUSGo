import { describe, expect, it, vi } from 'vitest'
import { createShuttleArrivalClient } from './client'

function responseFor(stopId: string): Response {
  return new Response(JSON.stringify({
    observedAt: '2026-09-23T13:48:26+08:00',
    expiresAt: '2026-09-23T13:49:26+08:00',
    stops: {
      [stopId]: {
        D2: {
          nextArrivalSeconds: 264,
          upcomingArrivalSeconds: [264, 624],
          headwaySeconds: { min: 360, max: 360, median: 360 },
        },
      },
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('createShuttleArrivalClient', () => {
  it('requests uncached stops in one batch', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      observedAt: '2026-09-23T13:48:26+08:00',
      expiresAt: '2026-09-23T13:49:26+08:00',
      stops: {
        PGP: { D2: { nextArrivalSeconds: 264, upcomingArrivalSeconds: [264], headwaySeconds: null } },
        'KR-MRT': { A1: { nextArrivalSeconds: 120, upcomingArrivalSeconds: [120], headwaySeconds: null } },
      },
    }), { status: 200 }))
    const client = createShuttleArrivalClient({ fetcher })
    const signal = new AbortController().signal

    const result = await client.getArrivals([
      { stopId: 'PGP', stopName: 'PGP' },
      { stopId: 'KR-MRT', stopName: 'Kent Ridge MRT' },
    ], signal)

    expect(fetcher).toHaveBeenCalledOnce()
    const requestUrl = new URL(String(fetcher.mock.calls[0][0]), 'http://localhost')
    expect(JSON.parse(requestUrl.searchParams.get('stops') ?? '')).toEqual([
      { stopId: 'PGP', stopName: 'PGP' },
      { stopId: 'KR-MRT', stopName: 'Kent Ridge MRT' },
    ])
    expect(Object.keys(result.stops)).toEqual(['PGP', 'KR-MRT'])
  })

  it('reuses cached stop data and shares an in-progress request', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => responseFor('PGP'))
    const client = createShuttleArrivalClient({ fetcher })
    const stop = { stopId: 'PGP', stopName: 'PGP' }
    const signal = new AbortController().signal

    const [first, second] = await Promise.all([
      client.getArrivals([stop], signal),
      client.getArrivals([stop], signal),
    ])
    await client.getArrivals([stop], signal)

    expect(fetcher).toHaveBeenCalledOnce()
    expect(first.stops.PGP.D2.nextArrivalSeconds).toBe(264)
    expect(second.stops.PGP.D2.nextArrivalSeconds).toBe(264)
  })

  it('does not use stale cached data when a refresh fails', async () => {
    let now = 0
    const fetcher = vi.fn<typeof fetch>(async () => responseFor('PGP'))
    const client = createShuttleArrivalClient({
      fetcher,
      now: () => now,
      cacheTtlMs: 10,
    })
    const stop = { stopId: 'PGP', stopName: 'PGP' }
    const signal = new AbortController().signal

    await client.getArrivals([stop], signal)
    now = 11
    fetcher.mockRejectedValueOnce(new Error('API unavailable'))

    await expect(client.getArrivals([stop], signal)).rejects.toThrow('No shuttle arrival data is available')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('normalizes arrival ordering and drops invalid headways', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      observedAt: '2026-09-23T13:48:26+08:00',
      expiresAt: '2026-09-23T13:49:26+08:00',
      stops: {
        PGP: {
          D2: {
            nextArrivalSeconds: 600,
            upcomingArrivalSeconds: [600, 300, 300],
            headwaySeconds: { min: 0, max: 0, median: 0 },
          },
        },
      },
    }), { status: 200 }))

    const result = await createShuttleArrivalClient({ fetcher }).getArrivals([
      { stopId: 'PGP', stopName: 'PGP' },
    ], new AbortController().signal)

    expect(result.stops.PGP.D2).toEqual({
      nextArrivalSeconds: 300,
      upcomingArrivalSeconds: [300, 600],
      headwaySeconds: null,
    })
  })

  it('rejects invalid snapshot timestamps', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      observedAt: 'not-a-date',
      expiresAt: '2026-09-23T13:49:26+08:00',
      stops: {},
    }), { status: 200 }))

    await expect(createShuttleArrivalClient({ fetcher }).getArrivals([
      { stopId: 'PGP', stopName: 'PGP' },
    ], new AbortController().signal)).rejects.toThrow('No shuttle arrival data is available')
  })
})
