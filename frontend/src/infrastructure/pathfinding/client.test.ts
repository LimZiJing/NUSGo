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

  it('sends only a waypoint coordinate and never its saved identity or details', async () => {
    let capturedBody = ''
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = String(init?.body)
      return response({ outcome: 'no-path' })
    })
    const client = createJourneyPlanningClient({ endpoint: '/api/journeys', fetcher })
    const personalWaypoint = {
      kind: 'personal-waypoint',
      id: '00000000-0000-4000-8000-000000000041',
      label: 'Quiet bench',
      coordinate: { longitude: 103.78, latitude: 1.29, metadata: 'coordinate detail' },
      category: 'Rest areas',
      note: 'Near the sheltered walkway',
      updatedAt: '2026-10-25T00:00:00.000Z',
    } as const

    await client({
      origin: personalWaypoint,
      destination: { kind: 'stop', id: 'STOP-A' },
    }, { signal: new AbortController().signal })

    expect(JSON.parse(capturedBody)).toEqual({
      origin: {
        kind: 'waypoint-coordinate',
        coordinate: { longitude: 103.78, latitude: 1.29 },
      },
      destination: { kind: 'stop', id: 'STOP-A' },
    })
    expect(capturedBody).not.toContain('Quiet bench')
    expect(capturedBody).not.toContain('Near the sheltered walkway')
    expect(capturedBody).not.toContain(personalWaypoint.id)
    expect(capturedBody).not.toContain('coordinate detail')
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

  it('preserves rate-limit failures as a distinct server error', async () => {
    const client = createJourneyPlanningClient({
      endpoint: '/api/journeys',
      fetcher: async () => response({
        error: 'Journey planning rate limit reached',
        code: 'rate_limited',
      }, 429),
    })

    await expect(client(request, { signal: new AbortController().signal }))
      .rejects.toMatchObject({ status: 429, code: 'rate_limited' })
  })

  it('preserves planning timeouts as a distinct server error', async () => {
    const client = createJourneyPlanningClient({
      endpoint: '/api/journeys',
      fetcher: async () => response({
        error: 'Journey planning timed out',
        code: 'planning_timeout',
      }, 504),
    })

    await expect(client(request, { signal: new AbortController().signal }))
      .rejects.toMatchObject({ status: 504, code: 'planning_timeout' })
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

  it('rejects incomplete candidates before their geometry reaches the map', async () => {
    const client = createJourneyPlanningClient({
      endpoint: '/api/journeys',
      fetcher: async () => response({
        outcome: 'paths',
        searchStatus: 'complete',
        candidates: [{
          candidateKey: 'walking:COM1>COM3',
          adjustedDurationSeconds: 10,
          score: 0.1,
          path: {
            origin: request.origin,
            destination: { kind: 'venue', id: 'COM3' },
            legs: [{
              mode: 'walking',
              from: request.origin,
              to: { kind: 'venue', id: 'COM3' },
              durationSeconds: 10,
              distanceMeters: 20,
              geometry: { type: 'LineString', coordinates: [[103.78, 1.29], ['bad', 1]] },
            }],
            totalDurationSeconds: 10,
            totalDistanceMeters: 20,
            estimateStatus: 'estimated',
            planningQuality: 'exact',
          },
        }],
      }),
    })

    await expect(client(request, { signal: new AbortController().signal }))
      .rejects.toThrow('Journey planning response was invalid')
  })

  it('restores the planner score serialized as null for a zero-duration Path', async () => {
    const client = createJourneyPlanningClient({
      endpoint: '/api/journeys',
      fetcher: async () => response({
        outcome: 'paths',
        searchStatus: 'complete',
        candidates: [{
          candidateKey: 'walking:COM1>COM3',
          adjustedDurationSeconds: 0,
          score: null,
          path: {
            origin: request.origin,
            destination: { kind: 'venue', id: 'COM3' },
            legs: [{
              mode: 'walking',
              from: request.origin,
              to: { kind: 'venue', id: 'COM3' },
              durationSeconds: 0,
              distanceMeters: 0,
              geometry: { type: 'LineString', coordinates: [[103.78, 1.29], [103.78, 1.29]] },
            }],
            totalDurationSeconds: 0,
            totalDistanceMeters: 0,
            estimateStatus: 'estimated',
            planningQuality: 'exact',
          },
        }],
      }),
    })

    const result = await client(request, { signal: new AbortController().signal })
    expect(result.outcome).toBe('paths')
    if (result.outcome === 'paths') expect(result.candidates[0]?.score).toBe(Number.POSITIVE_INFINITY)
  })
})
