import { describe, expect, it, vi } from 'vitest'
import { createShuttleVehicleClient, ShuttleVehicleFetchError } from './client'

const response = {
  observedAt: '2026-11-02T00:00:00.000Z',
  expiresAt: '2026-11-02T00:01:30.000Z',
  vehicles: [{
    routeId: 'D2',
    plate: 'PD726D',
    lat: 1.291666,
    lng: 103.783352,
    headingDegrees: 310,
    speed: 15,
    load: 'medium',
    observedAt: '2026-11-02T00:00:00.000Z',
    expiresAt: '2026-11-02T00:01:30.000Z',
  }],
}

describe('createShuttleVehicleClient', () => {
  it('preserves cancellation while reading the response body', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    const response = new Response('{}')
    vi.spyOn(response, 'json').mockRejectedValue(abortError)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response)
    await expect(createShuttleVehicleClient({ fetcher }).getVehicles(
      ['D2'], new AbortController().signal,
    )).rejects.toBe(abortError)
  })

  it.each([
    [new Response('private response', { status: 503 }), 'http', 503],
    [new Response('invalid JSON'), 'invalid-response', undefined],
    [new Response('{}'), 'invalid-response', undefined],
  ])('retains safe diagnostic metadata for unsuccessful responses', async (response, reason, status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response)
    await expect(createShuttleVehicleClient({ fetcher }).getVehicles(
      ['D2'], new AbortController().signal,
    )).rejects.toMatchObject({ reason, status })
  })

  it('requests vehicles for the selected routes and validates the response', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(response), { status: 200 }))
    const signal = new AbortController().signal

    const result = await createShuttleVehicleClient({ fetcher }).getVehicles(['D2'], signal)

    expect(fetcher).toHaveBeenCalledWith('/api/shuttle-vehicles?routes=D2', { signal })
    expect(result).toEqual(response)
  })

  it('encodes unique route IDs and uses a configured API origin', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(response), { status: 200 }))
    const client = createShuttleVehicleClient({ apiOrigin: 'https://api.example.test', fetcher })

    await client.getVehicles(['D2', 'A1', 'D2'], new AbortController().signal)

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/shuttle-vehicles?routes=D2%2CA1',
      { signal: expect.any(AbortSignal) },
    )
  })

  it('rejects a response that fails the shared vehicle validator', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      ...response,
      vehicles: [{ ...response.vehicles[0], load: 'crowded' }],
    }), { status: 200 }))

    await expect(createShuttleVehicleClient({ fetcher }).getVehicles(
      ['D2'],
      new AbortController().signal,
    )).rejects.toBeInstanceOf(ShuttleVehicleFetchError)
  })

  it('preserves request abort errors', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(abortError)

    await expect(createShuttleVehicleClient({ fetcher }).getVehicles(
      ['D2'],
      new AbortController().signal,
    )).rejects.toBe(abortError)
  })
})
