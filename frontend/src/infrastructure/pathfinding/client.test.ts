import { describe, expect, it, vi } from 'vitest'
import { createJourneyPlanningClient } from './client'

const request = {
  origin: { kind: 'venue', id: 'COM1' },
  destination: { kind: 'current-location', coordinate: { longitude: 103.78, latitude: 1.29 } },
} as const

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Journey planning client', () => {
  it('sends only endpoint references and forwards cancellation', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/journeys')
      expect(init?.method).toBe('POST')
      return response({ outcome: 'no-path' })
    })
    const signal = new AbortController().signal
    const client = createJourneyPlanningClient({ endpoint: '/api/journeys', fetcher })

    await expect(client(request, { signal })).resolves.toEqual({ outcome: 'no-path' })

    const [, init] = fetcher.mock.calls[0]!
    expect(init?.signal).toBe(signal)
    expect(JSON.parse(String(init?.body))).toEqual(request)
  })

  it('includes only the optional development departure clock when configured', async () => {
    let capturedBody = ''
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/journeys')
      capturedBody = String(init?.body)
      return response({ outcome: 'no-path' })
    })
    const client = createJourneyPlanningClient({
      endpoint: '/api/journeys',
      fetcher,
      getSimulatedDepartureMs: () => 1_800_000_000_000,
    })

    await client(request, { signal: new AbortController().signal })

    expect(JSON.parse(capturedBody)).toEqual({
      ...request,
      simulatedDepartureMs: 1_800_000_000_000,
    })
  })

  it('keeps provider errors as failures and preserves their structured code', async () => {
    const client = createJourneyPlanningClient({
      endpoint: '/api/journeys',
      fetcher: async () => response({
        error: 'Walking route provider is unavailable',
        code: 'provider_unavailable',
      }, 503),
    })

    await expect(client(request, { signal: new AbortController().signal }))
      .rejects.toMatchObject({
        name: 'JourneyPlanningRequestError',
        status: 503,
        code: 'provider_unavailable',
      })
  })

  it('passes through aborts and rejects malformed success responses', async () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    const cancelled = createJourneyPlanningClient({
      endpoint: '/api/journeys',
      fetcher: async () => { throw abort },
    })
    await expect(cancelled(request, { signal: new AbortController().signal }))
      .rejects.toBe(abort)

    const malformed = createJourneyPlanningClient({
      endpoint: '/api/journeys',
      fetcher: async () => response({ outcome: 'paths', candidates: [] }),
    })
    await expect(malformed(request, { signal: new AbortController().signal }))
      .rejects.toThrow('Journey planning response was invalid')
  })
})
