import { describe, expect, it, vi } from 'vitest'
import { createValhallaRouteEngine } from './valhalla-walking-client.ts'

const origin = { longitude: 103, latitude: 1 }
const destination = { longitude: 103.01, latitude: 1.01 }

function responseWithJson(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('Valhalla route engine', () => {
  it('decodes encoded Valhalla leg shapes', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => responseWithJson({
      trip: {
        units: 'kilometers',
        summary: { length: 0.498, time: 383 },
        legs: [{
          shape: 'qrdnA_v_}dEhHgX|@_C`D{FvLaUpMkVhAqDx@sDG_CaB{FUm@wATmKdAKeAiELsG[yFsAyCk@{Aw@Kc@Cq@qDy@fB}GvDuPbBoILiHIwGImCy@eGgAeFgBuGWaAqBkFi@_C',
        }],
      },
    }))
    const engine = createValhallaRouteEngine({ baseUrl: 'https://routing.example.test', fetcher })

    await expect(engine.routeWalking({ origin, destination }, new AbortController().signal))
      .resolves.toMatchObject({
        geometry: {
          type: 'LineString',
          coordinates: expect.arrayContaining([[103.776624, 1.297209]]),
        },
      })
  })

  it('requests a pedestrian route and returns validated metric values', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => responseWithJson({
      trip: {
        units: 'kilometers',
        summary: { length: 1.25, time: 93 },
        legs: [{
          shape: {
            type: 'LineString',
            coordinates: [[103, 1], [103.01, 1.01]],
          },
        }],
      },
    }))
    const engine = createValhallaRouteEngine({
      baseUrl: 'https://routing.example.test/',
      fetcher,
    })

    await expect(engine.routeWalking({ origin, destination }, new AbortController().signal)).resolves.toEqual({
      distanceMeters: 1250,
      durationSeconds: 93,
      geometry: {
        type: 'LineString',
        coordinates: [[103, 1], [103.01, 1.01]],
      },
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://routing.example.test/route')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual({
      locations: [
        { lat: 1, lon: 103, type: 'break' },
        { lat: 1.01, lon: 103.01, type: 'break' },
      ],
      costing: 'pedestrian',
      directions_type: 'none',
      directions_options: { narrative: false, units: 'kilometers' },
      shape_format: 'geojson',
    })
  })

  it('returns walking matrix connections in metres and seconds', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => responseWithJson({
      units: 'kilometers',
      sources_to_targets: [
        [
          { from_index: 0, to_index: 0, distance: 0, time: 0 },
          { from_index: 0, to_index: 1, distance: 0.4, time: 300 },
        ],
      ],
    }))
    const engine = createValhallaRouteEngine({ baseUrl: 'https://routing.example.test', fetcher })

    await expect(engine.matrixWalking({
      sources: [origin],
      targets: [origin, destination],
    }, new AbortController().signal)).resolves.toEqual([
      { fromIndex: 0, toIndex: 0, distanceMeters: 0, durationSeconds: 0 },
      { fromIndex: 0, toIndex: 1, distanceMeters: 400, durationSeconds: 300 },
    ])

    const [, init] = fetcher.mock.calls[0]
    expect(JSON.parse(String(init?.body))).toEqual({
      sources: [{ lat: 1, lon: 103 }],
      targets: [{ lat: 1, lon: 103 }, { lat: 1.01, lon: 103.01 }],
      costing: 'pedestrian',
      units: 'kilometers',
      verbose: true,
    })
  })

  it('fails closed for invalid route geometry and negative values', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => responseWithJson({
      trip: {
        summary: { length: -1, time: 93 },
        legs: [{ shape: { type: 'Point', coordinates: [[103, 1]] } }],
      },
    }))
    const engine = createValhallaRouteEngine({ baseUrl: 'https://routing.example.test', fetcher })

    await expect(engine.routeWalking({ origin, destination }, new AbortController().signal))
      .rejects.toThrow('Valhalla route response has invalid summary')
  })

  it('rejects provider responses with unexpected distance units', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => responseWithJson({
      trip: {
        units: 'miles',
        summary: { length: 1.25, time: 93 },
        legs: [{
          shape: {
            type: 'LineString',
            coordinates: [[103, 1], [103.01, 1.01]],
          },
        }],
      },
    }))
    const engine = createValhallaRouteEngine({ baseUrl: 'https://routing.example.test', fetcher })

    await expect(engine.routeWalking({ origin, destination }, new AbortController().signal))
      .rejects.toThrow('Valhalla route response must use kilometre units')
  })

  it('rejects invalid request coordinates before calling Valhalla', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const engine = createValhallaRouteEngine({ baseUrl: 'https://routing.example.test', fetcher })

    await expect(engine.routeWalking({
      origin: { longitude: 103, latitude: 91 },
      destination,
    }, new AbortController().signal)).rejects.toThrow('Origin has invalid coordinates')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reports HTTP failures without exposing provider payloads', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('private provider details', { status: 503 }))
    const engine = createValhallaRouteEngine({ baseUrl: 'https://routing.example.test', fetcher })

    await expect(engine.routeWalking({ origin, destination }, new AbortController().signal))
      .rejects.toThrow('Valhalla route request failed: 503')
  })

  it('wraps an unowned AbortError as a provider failure', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    const fetcher = vi.fn<typeof fetch>(async () => { throw abortError })
    const engine = createValhallaRouteEngine({ baseUrl: 'https://routing.example.test', fetcher })

    await expect(engine.routeWalking({ origin, destination }, new AbortController().signal))
      .rejects.toThrow('Valhalla route request failed')
  })

  it('preserves the caller abort reason when fetch rejects after cancellation', async () => {
    const callerAbortError = new Error('Journey was cancelled')
    callerAbortError.name = 'AbortError'
    const fetchController = new AbortController()
    const fetcher = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The fetch was aborted.', 'AbortError'))
      }, { once: true })
    }))
    const engine = createValhallaRouteEngine({ baseUrl: 'https://routing.example.test', fetcher })
    const pending = engine.routeWalking({ origin, destination }, fetchController.signal)
    const outcome = pending.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    fetchController.abort(callerAbortError)

    await expect(outcome).resolves.toEqual({ error: callerAbortError })
  })

  it('preserves the owning abort reason when fetch rejects after cancellation', async () => {
    const deadlineError = new Error('Path geometry completion exceeded its time budget')
    deadlineError.name = 'TimeoutError'

    const fetchController = new AbortController()
    const fetcher = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The fetch was aborted.', 'AbortError'))
      }, { once: true })
    }))
    const fetchEngine = createValhallaRouteEngine({ baseUrl: 'https://routing.example.test', fetcher })
    const fetchPending = fetchEngine.routeWalking({ origin, destination }, fetchController.signal)
    const fetchOutcome = fetchPending.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    fetchController.abort(deadlineError)
    await expect(fetchOutcome).resolves.toEqual({ error: deadlineError })
  })

  it('preserves the owning abort reason while reading the response body', async () => {
    const deadlineError = new Error('Path geometry completion exceeded its time budget')
    deadlineError.name = 'TimeoutError'
    const bodyController = new AbortController()
    let markBodyStarted = (): void => {}
    const bodyStarted = new Promise<void>((resolve) => { markBodyStarted = resolve })
    const bodyResponse = {
      ok: true,
      json: vi.fn(() => new Promise((_resolve, reject) => {
        markBodyStarted()
        bodyController.signal.addEventListener('abort', () => {
          reject(new DOMException('The body read was aborted.', 'AbortError'))
        }, { once: true })
      })),
    } as unknown as Response
    const bodyEngine = createValhallaRouteEngine({
      baseUrl: 'https://routing.example.test',
      fetcher: vi.fn<typeof fetch>(async () => bodyResponse),
    })
    const bodyPending = bodyEngine.routeWalking({ origin, destination }, bodyController.signal)
    const bodyOutcome = bodyPending.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    await bodyStarted
    bodyController.abort(deadlineError)
    await expect(bodyOutcome).resolves.toEqual({ error: deadlineError })
  })

  it('does not classify an unowned transport TimeoutError as cancellation', async () => {
    const timeoutError = new Error('transport timed out')
    timeoutError.name = 'TimeoutError'
    const fetcher = vi.fn<typeof fetch>(async () => { throw timeoutError })
    const engine = createValhallaRouteEngine({ baseUrl: 'https://routing.example.test', fetcher })

    await expect(engine.routeWalking({ origin, destination }, new AbortController().signal))
      .rejects.toThrow('Valhalla route request failed')
  })
})
