import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createLtaPublicBusArrivalProvider } from './provider.ts'
import type { LtaPublicBusStopMapping } from './bus-stop-mapping.ts'

const mappings: readonly LtaPublicBusStopMapping[] = [
  { stopId: 'STOP-A', busStopCode: '12345', services: ['95', '151', '96'] },
]

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('LTA public bus arrival provider', () => {
  it('distinguishes live, no-estimate, and out-of-operation services and caches stop data', async () => {
    let fetchCount = 0
    const provider = createLtaPublicBusArrivalProvider({
      accountKey: 'test-account-key',
      mappings,
      now: () => Date.parse('2026-10-15T03:00:00.000Z'),
      scheduleLoader: async (serviceNumber) => serviceNumber === '151'
        ? { operating: false, nextStartMs: Date.parse('2026-10-15T21:30:00.000Z') }
        : null,
      fetcher: async () => {
        fetchCount += 1
        return jsonResponse({
          Services: [{
            ServiceNo: '95',
            NextBus: {
              EstimatedArrival: '2026-10-15T03:05:00.000Z',
              Monitored: 1,
            },
          }],
        })
      },
    })

    const stopIds = mappings.map(({ stopId }) => stopId)
    const first = await provider.getArrivals(stopIds, new AbortController().signal)
    const second = await provider.getArrivals(stopIds, new AbortController().signal)

    assert.deepEqual(first.stops['STOP-A']?.services['95'], {
      status: 'live',
      arrivals: [{ estimatedAt: '2026-10-15T03:05:00.000Z', monitored: true }],
    })
    assert.deepEqual(first.stops['STOP-A']?.services['151'], {
      status: 'not-in-operation',
      arrivals: [],
      nextStartAt: '2026-10-15T21:30:00.000Z',
    })
    assert.deepEqual(first.stops['STOP-A']?.services['96'], { status: 'no-estimate', arrivals: [] })
    assert.equal(first.stops['STOP-A'], second.stops['STOP-A'])
    assert.equal(fetchCount, 1)
  })

  it('reports malformed or unavailable LTA responses as provider errors', async () => {
    const provider = createLtaPublicBusArrivalProvider({
      accountKey: 'test-account-key',
      mappings,
      fetcher: async () => jsonResponse({ Services: 'invalid' }, 200),
    })

    const result = await provider.getArrivals(mappings.map(({ stopId }) => stopId), new AbortController().signal)
    assert.equal(result.stops['STOP-A']?.services['95']?.status, 'provider-error')
    assert.equal(result.stops['STOP-A']?.services['151']?.status, 'provider-error')
  })

  it('bounds concurrent stop requests', async () => {
    const manyMappings = Array.from({ length: 5 }, (_, index) => ({
      stopId: 'STOP-' + index,
      busStopCode: String(12340 + index),
      services: ['95'],
    }))
    let active = 0
    let maximumActive = 0
    const provider = createLtaPublicBusArrivalProvider({
      accountKey: 'test-account-key',
      mappings: manyMappings,
      maxConcurrency: 2,
      fetcher: async () => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 2))
        active -= 1
        return jsonResponse({ Services: [] })
      },
    })

    await provider.getArrivals(manyMappings.map(({ stopId }) => stopId), new AbortController().signal)
    assert.equal(maximumActive, 2)
  })
})
