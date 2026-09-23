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

  it('uses stale cached data when a refresh fails', async () => {
    let now = 0
    const fetcher = vi.fn<typeof fetch>(async () => responseFor('PGP'))
    const client = createShuttleArrivalClient({
      fetcher,
      now: () => now,
      cacheTtlMs: 10,
      staleTtlMs: 100,
    })
    const stop = { stopId: 'PGP', stopName: 'PGP' }
    const signal = new AbortController().signal

    await client.getArrivals([stop], signal)
    now = 11
    fetcher.mockRejectedValueOnce(new Error('API unavailable'))
    const result = await client.getArrivals([stop], signal)

    expect(result.stops.PGP.D2.nextArrivalSeconds).toBe(264)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
