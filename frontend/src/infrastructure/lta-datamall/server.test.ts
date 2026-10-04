import { describe, expect, it, vi } from 'vitest'
import { createLtaPublicBusArrivalProvider } from './server'

const mapping = [{ stopId: 'KRB', busStopCode: '16009', services: ['95', '151'] }]

function jsonResponse(value: unknown, ok = true): Response {
  return new Response(JSON.stringify(value), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createLtaPublicBusArrivalProvider', () => {
  it('returns live arrivals and caches a stop for the refresh window', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      Services: [{
        ServiceNo: '95',
        NextBus: { EstimatedArrival: '2026-10-03T10:01:00.000Z', Monitored: 1 },
      }],
    }))
    const provider = createLtaPublicBusArrivalProvider({
      accountKey: 'test-key',
      mappings: mapping,
      now: () => Date.parse('2026-10-03T10:00:00.000Z'),
      scheduleLoader: async () => false,
      fetcher,
    })

    const first = await provider.getArrivals(mapping, new AbortController().signal)
    const second = await provider.getArrivals(mapping, new AbortController().signal)

    expect(first.stops.KRB.services['95']).toEqual({
      status: 'live',
      arrivals: [{ estimatedAt: '2026-10-03T10:01:00.000Z', monitored: true }],
    })
    expect(first.stops.KRB.services['151']).toEqual({ status: 'not-in-operation', arrivals: [] })
    expect(second.stops.KRB).toBe(first.stops.KRB)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps an upstream failure distinct from no estimate', async () => {
    const provider = createLtaPublicBusArrivalProvider({
      accountKey: 'test-key',
      mappings: mapping,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, false)),
    })

    const snapshot = await provider.getArrivals(mapping, new AbortController().signal)
    expect(snapshot.stops.KRB.services['95'].status).toBe('provider-error')
    expect(snapshot.stops.KRB.services['151'].status).toBe('provider-error')
  })
})
