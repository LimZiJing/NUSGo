import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Request } from 'express'
import type { ApiJourneyPlanningRequest, ApiJourneyPlanningResponse } from '@nusgo/shared/routing/path'
import { loadBackendConfig } from '../config.ts'
import type { BackendData } from '../canonical-data.ts'
import type { BackendLiveData } from '../live-data/runtime.ts'
import { createApp } from './app.ts'
import { getRateLimitClientAddress } from './rate-limiter.ts'
import { closeHttpServer, listenHttpServer } from '../server.ts'

const journeyRequest = {
  origin: { kind: 'venue', id: 'COM1' },
  destination: { kind: 'stop', id: 'COM3' },
} as const

interface Planner {
  plan(request: ApiJourneyPlanningRequest, signal: AbortSignal): Promise<ApiJourneyPlanningResponse>
}

async function withServer(
  planner: Planner | null,
  run: (baseUrl: string) => Promise<void>,
  environment: Record<string, string | undefined> = {},
): Promise<void> {
  const config = loadBackendConfig({
    NODE_ENV: 'test',
    API_CORS_ORIGINS: 'http://localhost:5173',
    ...environment,
  })
  const server = await listenHttpServer(createApp(config, null, null, planner), '127.0.0.1', 0)
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not expose its port')
  try {
    await run('http://127.0.0.1:' + address.port)
  } finally {
    await closeHttpServer(server)
  }
}

async function postJourney(
  baseUrl: string,
  signal?: AbortSignal,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(baseUrl + '/api/journeys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(journeyRequest),
    signal,
  })
}

async function get(baseUrl: string, path: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(baseUrl + path, { headers })
}

type VehiclesResponse = ReturnType<BackendLiveData['getVehicles']>

const vehiclesBody: VehiclesResponse = {
  observedAt: '2026-10-28T08:00:00.000Z',
  expiresAt: '2026-10-28T08:01:30.000Z',
  vehicles: [{
    routeId: 'D1',
    plate: 'TEST0001A',
    lat: 1.2966,
    lng: 103.7764,
    headingDegrees: 90,
    speed: 12,
    load: 'low',
    observedAt: '2026-10-28T08:00:00.000Z',
    expiresAt: '2026-10-28T08:01:30.000Z',
  }],
  unavailableRouteIds: ['D2'],
}

// Only the canonical route list matters to the vehicles route; stops must exist for route registration.
function fakeData(routeIds: readonly string[]): BackendData {
  return { network: { routes: routeIds.map((id) => ({ id })), stops: [] } } as unknown as BackendData
}

function fakeLiveData(
  getVehicles: BackendLiveData['getVehicles'],
): BackendLiveData {
  const unused = (): never => {
    throw new Error('Not used by vehicle route tests')
  }
  return {
    isSnapshotReady: () => true,
    getPublicBusStopIds: () => [],
    getBusArrivals: unused,
    getVehicles,
    getServiceWindows: unused,
    getPublicBusArrivals: unused,
    start: () => undefined,
    stop: () => Promise.resolve(),
  }
}

async function withLiveDataServer(
  data: BackendData,
  liveData: BackendLiveData | null,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const config = loadBackendConfig({ NODE_ENV: 'test', API_CORS_ORIGINS: 'http://localhost:5173' })
  const server = await listenHttpServer(createApp(config, data, liveData, null), '127.0.0.1', 0)
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not expose its port')
  try {
    await run('http://127.0.0.1:' + address.port)
  } finally {
    await closeHttpServer(server)
  }
}

describe('Express API request limits', () => {
  it('ignores Cloudflare client headers from a non-loopback peer', () => {
    const request = {
      socket: { remoteAddress: '203.0.113.10' },
      ip: '198.51.100.10',
      get: () => '192.0.2.10',
    } as unknown as Request

    assert.equal(getRateLimitClientAddress(request), '203.0.113.10')
  })

  it('limits requests across public data and Journey routes', async () => {
    let plannerCalls = 0
    await withServer({
      async plan() {
        plannerCalls += 1
        return { outcome: 'no-path' }
      },
    }, async (baseUrl) => {
      assert.equal((await get(baseUrl, '/api/health')).status, 200)
      assert.equal((await get(baseUrl, '/api/shuttle-arrivals')).status, 503)

      const limited = await postJourney(baseUrl)
      assert.equal(limited.status, 429)
      assert.ok(Number(limited.headers.get('retry-after')) > 0)
      assert.deepEqual(await limited.json(), {
        error: 'API request rate limit reached',
        code: 'rate_limited',
      })
    }, { API_RATE_LIMIT_MAX_REQUESTS: '2' })
    assert.equal(plannerCalls, 0)
  })

  it('applies the shared API limit to every public route', async () => {
    const routes = [
      { path: '/api/health', method: 'GET' },
      { path: '/api/ready', method: 'GET' },
      { path: '/api/shuttle-arrivals', method: 'GET' },
      { path: '/api/shuttle-service-windows', method: 'GET' },
      { path: '/api/shuttle-vehicles', method: 'GET' },
      { path: '/api/public-bus-arrivals', method: 'GET' },
      { path: '/api/journeys', method: 'POST' },
    ] as const

    await withServer(null, async (baseUrl) => {
      for (const [index, route] of routes.entries()) {
        const clientIp = `203.0.113.${index + 1}`
        const headers = { 'CF-Connecting-IP': clientIp }
        const first = route.method === 'POST'
          ? await postJourney(baseUrl, undefined, headers)
          : await get(baseUrl, route.path, headers)
        assert.notEqual(first.status, 429, `${route.path} is available within the client budget`)

        const nextRoute = routes[(index + 1) % routes.length]!
        const limited = nextRoute.method === 'POST'
          ? await postJourney(baseUrl, undefined, headers)
          : await get(baseUrl, nextRoute.path, headers)
        assert.equal(limited.status, 429, `${nextRoute.path} shares the API client budget`)
      }
    }, { API_RATE_LIMIT_MAX_REQUESTS: '1' })
  })

  it('uses the Cloudflare client address for requests through the loopback tunnel', async () => {
    await withServer(null, async (baseUrl) => {
      const first = await get(baseUrl, '/api/health', {
        'CF-Connecting-IP': '203.0.113.10',
        'X-Forwarded-For': '198.51.100.10',
      })
      assert.equal(first.status, 200)

      const sameClient = await get(baseUrl, '/api/health', {
        'CF-Connecting-IP': '203.0.113.10',
        'X-Forwarded-For': '198.51.100.11',
      })
      assert.equal(sameClient.status, 429)

      const differentClient = await get(baseUrl, '/api/health', {
        'CF-Connecting-IP': '203.0.113.11',
      })
      assert.equal(differentClient.status, 200)
    }, { API_RATE_LIMIT_MAX_REQUESTS: '1' })
  })

  it('counts requests rejected by CORS against the API budget', async () => {
    await withServer(null, async (baseUrl) => {
      const rejectedOrigin = await get(baseUrl, '/api/health', {
        Origin: 'https://untrusted.example',
        'CF-Connecting-IP': '203.0.113.10',
      })
      assert.equal(rejectedOrigin.status, 403)

      const withoutOrigin = await get(baseUrl, '/api/health', {
        'CF-Connecting-IP': '203.0.113.10',
      })
      assert.equal(withoutOrigin.status, 429)
    }, { API_RATE_LIMIT_MAX_REQUESTS: '1' })
  })
})

describe('GET /api/shuttle-vehicles', () => {
  it('returns the latest vehicles and passes the requested route IDs through', async () => {
    const requested: string[][] = []
    const liveData = fakeLiveData((routeIds) => {
      requested.push([...routeIds])
      return vehiclesBody
    })
    await withLiveDataServer(fakeData(['D1', 'D2']), liveData, async (baseUrl) => {
      const response = await get(baseUrl, '/api/shuttle-vehicles?routes=D1,D2')
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), vehiclesBody)
    })
    assert.deepEqual(requested, [['D1', 'D2']])
  })

  it('rejects an unknown route without reading vehicle data', async () => {
    let calls = 0
    const liveData = fakeLiveData(() => {
      calls += 1
      return vehiclesBody
    })
    await withLiveDataServer(fakeData(['D1']), liveData, async (baseUrl) => {
      const response = await get(baseUrl, '/api/shuttle-vehicles?routes=Z9')
      assert.equal(response.status, 400)
      const body = (await response.json()) as { code?: string; vehicles?: unknown }
      assert.equal(body.code, 'invalid_request')
      assert.equal('vehicles' in body, false)
    })
    assert.equal(calls, 0)
  })

  it('rejects a missing routes query', async () => {
    await withLiveDataServer(fakeData(['D1']), fakeLiveData(() => vehiclesBody), async (baseUrl) => {
      const response = await get(baseUrl, '/api/shuttle-vehicles')
      assert.equal(response.status, 400)
      assert.equal(((await response.json()) as { code?: string }).code, 'invalid_request')
    })
  })

  it('rejects more than 16 route IDs', async () => {
    let calls = 0
    const liveData = fakeLiveData(() => {
      calls += 1
      return vehiclesBody
    })
    const oversized = Array.from({ length: 17 }, () => 'D1').join(',')
    await withLiveDataServer(fakeData(['D1']), liveData, async (baseUrl) => {
      const response = await get(baseUrl, '/api/shuttle-vehicles?routes=' + oversized)
      assert.equal(response.status, 400)
      assert.equal(((await response.json()) as { code?: string }).code, 'invalid_request')
    })
    assert.equal(calls, 0)
  })

  it('rejects a malformed route ID', async () => {
    let calls = 0
    const liveData = fakeLiveData(() => {
      calls += 1
      return vehiclesBody
    })
    await withLiveDataServer(fakeData(['A1']), liveData, async (baseUrl) => {
      const response = await get(baseUrl, '/api/shuttle-vehicles?routes=' + encodeURIComponent('A1;drop'))
      assert.equal(response.status, 400)
      assert.equal(((await response.json()) as { code?: string }).code, 'invalid_request')
    })
    assert.equal(calls, 0)
  })

  it('answers POST with 405 and lists the allowed methods', async () => {
    await withLiveDataServer(fakeData(['D1']), fakeLiveData(() => vehiclesBody), async (baseUrl) => {
      const response = await fetch(baseUrl + '/api/shuttle-vehicles?routes=D1', { method: 'POST' })
      assert.equal(response.status, 405)
      assert.equal(response.headers.get('allow'), 'GET, HEAD, OPTIONS')
      assert.equal(((await response.json()) as { code?: string }).code, 'invalid_request')
    })
  })

  it('returns 503 not_ready when live data is unavailable', async () => {
    await withServer(null, async (baseUrl) => {
      const response = await get(baseUrl, '/api/shuttle-vehicles?routes=D1')
      assert.equal(response.status, 503)
      assert.equal(((await response.json()) as { code?: string }).code, 'not_ready')
    })
  })
})
