import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type { NusProviderConfig } from '../../../config.ts'
import { createNusActiveBusProvider, parseNusActiveBuses } from './active-buses.ts'
import type { NusApiRequest, NusApiSession, NusAuthenticatedClient } from './client.ts'

interface RawActiveBusFixture {
  readonly data: {
    readonly ActiveBusCount: string
    readonly activebus: readonly unknown[]
  }
}

function readFixture(name: string): RawActiveBusFixture {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'))
}

const goodBus = {
  vehplate: 'PD496S',
  lat: 1.291666,
  lng: 103.783352,
  speed: 15,
  direction: 309.8,
  loadInfo: { occupancy: 0.393, crowdLevel: 'medium', capacity: 89, ridership: 35 },
}

function makeBus(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...goodBus, ...overrides }
}

describe('NUS active-bus parsing', () => {
  it('parses the D2 fixture with every count and field typed correctly', () => {
    const fixture = readFixture('active-bus-d2.json')
    const buses = parseNusActiveBuses(fixture)

    assert.equal(buses.length, Number(fixture.data.ActiveBusCount))
    assert.equal(buses.length, fixture.data.activebus.length)
    for (const bus of buses) {
      assert.equal(typeof bus.plate, 'string')
      assert.equal(typeof bus.lat, 'number')
      assert.equal(typeof bus.lng, 'number')
      assert.equal(typeof bus.headingDegrees, 'number')
      assert.equal(typeof bus.speed, 'number')
      assert.ok(['low', 'medium', 'high', 'unknown'].includes(bus.load))
    }
    assert.deepEqual(buses[0], {
      plate: 'PD496S',
      lat: 1.291666,
      lng: 103.783352,
      headingDegrees: 309.8,
      speed: 15,
      load: 'medium',
    })
  })

  it('parses the A1 fixture with every count', () => {
    const fixture = readFixture('active-bus-a1.json')
    const buses = parseNusActiveBuses(fixture)

    assert.equal(buses.length, Number(fixture.data.ActiveBusCount))
    assert.equal(buses.length, fixture.data.activebus.length)
  })

  it('returns an empty list for an empty bus list', () => {
    assert.deepEqual(parseNusActiveBuses({ data: { ActiveBusCount: '0', activebus: [] } }), [])
  })

  it('returns an empty list for non-object payloads and missing envelopes', () => {
    assert.deepEqual(parseNusActiveBuses(null), [])
    assert.deepEqual(parseNusActiveBuses('activebus'), [])
    assert.deepEqual(parseNusActiveBuses([]), [])
    assert.deepEqual(parseNusActiveBuses({}), [])
    assert.deepEqual(parseNusActiveBuses({ data: null }), [])
    assert.deepEqual(parseNusActiveBuses({ data: { activebus: 'PD496S' } }), [])
  })

  it('skips a bad bus and keeps the valid ones', () => {
    const buses = parseNusActiveBuses({
      data: { activebus: [makeBus(), makeBus({ vehplate: '' }), makeBus({ vehplate: 'PD810T' })] },
    })

    assert.deepEqual(buses.map((bus) => bus.plate), ['PD496S', 'PD810T'])
  })

  it('skips buses with out-of-range heading or latitude', () => {
    const buses = parseNusActiveBuses({
      data: {
        activebus: [
          makeBus({ vehplate: 'A', direction: 361 }),
          makeBus({ vehplate: 'B', lat: 91 }),
          makeBus({ vehplate: 'C', lng: -180.5 }),
          makeBus({ vehplate: 'D', speed: -1 }),
          makeBus({ vehplate: 'E', lat: '1.3' }),
        ],
      },
    })

    assert.deepEqual(buses, [])
  })

  it('trims plates', () => {
    const [bus] = parseNusActiveBuses({ data: { activebus: [makeBus({ vehplate: ' PD496S ' })] } })

    assert.equal(bus.plate, 'PD496S')
  })

  it('reports unknown load when loadInfo is missing or null', () => {
    const buses = parseNusActiveBuses({
      data: {
        activebus: [
          makeBus({ vehplate: 'A', loadInfo: undefined }),
          makeBus({ vehplate: 'B', loadInfo: null }),
        ],
      },
    })

    assert.deepEqual(buses.map((bus) => [bus.plate, bus.load]), [['A', 'unknown'], ['B', 'unknown']])
  })

  it('reports unknown load for unrecognised crowd levels and does not derive it from occupancy', () => {
    const buses = parseNusActiveBuses({
      data: {
        activebus: [
          makeBus({ vehplate: 'A', loadInfo: { crowdLevel: 'crowded', occupancy: 0.99 } }),
          makeBus({ vehplate: 'B', loadInfo: { occupancy: 0.01 } }),
        ],
      },
    })

    assert.deepEqual(buses.map((bus) => bus.load), ['unknown', 'unknown'])
  })

  it('normalises crowd level case and whitespace', () => {
    const [bus] = parseNusActiveBuses({
      data: { activebus: [makeBus({ loadInfo: { crowdLevel: 'HIGH ' } })] },
    })

    assert.equal(bus.load, 'high')
  })
})

const provider: NusProviderConfig = {
  busProxyBaseUrl: 'https://bus.example.test',
  accessTokenUrl: 'https://auth.example.test/token',
  htdApi: 'htd',
  appApi: 'app',
  apiKey: 'test-key',
  deviceId: 'device-1',
  ipaddr: '127.0.0.1',
  version: '1.0.0',
}

const session: NusApiSession = { token: 'token-1', userId: 'user-1', domain: 'domain-1' }

function fakeClient(payload: unknown): { client: NusAuthenticatedClient, bodies: unknown[] } {
  const bodies: unknown[] = []
  const client: NusAuthenticatedClient = {
    async requestJson(requestFactory: (session: NusApiSession) => NusApiRequest) {
      const request = requestFactory(session)
      bodies.push(JSON.parse(String(request.init.body)))
      return payload
    },
  }
  return { client, bodies }
}

describe('createNusActiveBusProvider', () => {
  it('requests one route by route_code and returns parsed vehicles with an expiry', async () => {
    const { client, bodies } = fakeClient({ data: { activebus: [goodBus] } })
    const activeBuses = createNusActiveBusProvider({
      provider,
      client,
      deviceId: 'device-1',
      retryAttempts: 0,
      retryBaseDelayMs: 0,
      vehicleExpiryMs: 90_000,
      now: () => Date.parse('2026-10-10T10:00:00.000Z'),
    })

    const result = await activeBuses.loadRoute('D1', new AbortController().signal)

    assert.deepEqual(bodies, [expectedBody('D1')])
    assert.equal(result.observedAt, '2026-10-10T10:00:00.000Z')
    assert.equal(result.expiresAt, '2026-10-10T10:01:30.000Z')
    assert.deepEqual(result.vehicles, [{
      plate: 'PD496S',
      lat: 1.291666,
      lng: 103.783352,
      headingDegrees: 309.8,
      speed: 15,
      load: 'medium',
    }])
  })

  it('treats an empty bus list as a successful route with no vehicles', async () => {
    const { client } = fakeClient({ data: { ActiveBusCount: '0', activebus: [] } })
    const activeBuses = createNusActiveBusProvider({
      provider,
      client,
      deviceId: 'device-1',
      retryAttempts: 0,
      retryBaseDelayMs: 0,
      vehicleExpiryMs: 90_000,
      now: () => 0,
    })

    const result = await activeBuses.loadRoute('D1', new AbortController().signal)

    assert.deepEqual(result.vehicles, [])
  })

  it('throws for a garbage payload so it counts as a route failure', async () => {
    for (const payload of [null, 'activebus', [], {}, { data: null }, { data: 'activebus' }]) {
      const { client } = fakeClient(payload)
      const activeBuses = createNusActiveBusProvider({
        provider,
        client,
        deviceId: 'device-1',
        retryAttempts: 0,
        retryBaseDelayMs: 0,
        vehicleExpiryMs: 90_000,
      })

      await assert.rejects(activeBuses.loadRoute('D1', new AbortController().signal), /invalid/)
    }
  })
})

function expectedBody(routeCode: string): Record<string, string> {
  return {
    route_code: routeCode,
    deviceid: 'device-1',
    domain: 'domain-1',
    ipaddr: '127.0.0.1',
    token: 'token-1',
    userid: 'user-1',
    version: '1.0.0',
  }
}
