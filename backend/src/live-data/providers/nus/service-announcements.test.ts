import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { NusProviderConfig } from '../../../config.ts'
import {
  createNusAuthenticatedClient,
  type NusApiRequest,
  type NusAuthenticatedClient,
} from './client.ts'
import {
  createNusServiceAnnouncementProvider,
  parseNusTickerTapeResponse,
} from './service-announcements.ts'

const provider: NusProviderConfig = {
  busProxyBaseUrl: 'https://bus-proxy.nus.example',
  accessTokenUrl: 'https://auth.nus.example/token',
  htdApi: 'test-htd-api',
  appApi: 'test-app-api',
  apiKey: 'test-api-key',
  deviceId: 'backend-device',
  ipaddr: '0.0.0.0',
  version: 'test-version',
}

const activeRecord = {
  ID: '414',
  Message: 'As 9 Nov (Mon) is a PH in lieu of Deepavali, ISB services will operate the Term Sunday/PH schedule with the first bus at 9am.',
  Status: 'Enabled',
  Priority: 'Medium',
  Display_From: '2026-11-08T16:55:00+08:00',
  Display_To: '2026-11-09T23:00:00+08:00',
  Affected_Service_Ids: '',
  Created_On: '2026-11-08T16:50:00+08:00',
  Created_By: 'Some Staff Member',
  Accident_Latitude: null,
  Accident_Longitude: null,
}

/** The real envelope returns 310 historic records; the test keeps three representative ones. */
function tickerTape(records: readonly unknown[] = [activeRecord]): unknown {
  return { code: '00000', data: { TimeStamp: '2026-11-09T10:00:00+08:00', TickerTape: records } }
}

describe('NUS ticker-tape announcements', () => {
  it('normalizes an enabled record and drops author and incident fields', () => {
    const [record] = parseNusTickerTapeResponse(tickerTape())

    assert.deepEqual(record, {
      id: '414',
      message: activeRecord.Message,
      priority: 'medium',
      displayFromMs: Date.parse('2026-11-08T16:55:00+08:00'),
      displayToMs: Date.parse('2026-11-09T23:00:00+08:00'),
      affectedServiceRouteIds: [],
    })
    assert.equal(JSON.stringify(record).includes('Some Staff Member'), false)
    assert.equal(JSON.stringify(record).includes('Accident'), false)
  })

  it('splits a comma-separated affected-service list', () => {
    const [record] = parseNusTickerTapeResponse(tickerTape([
      { ...activeRecord, Affected_Service_Ids: 'A2, D1 ,D2' },
    ]))

    assert.deepEqual(record?.affectedServiceRouteIds, ['A2', 'D1', 'D2'])
  })

  it('keeps only enabled records and leaves the historic feed bounded by return value', () => {
    const records = parseNusTickerTapeResponse(tickerTape([
      { ...activeRecord, ID: '1', Status: 'Disabled' },
      { ...activeRecord, ID: '2', Status: 'Enabled' },
      { ...activeRecord, ID: '3', Status: 'enabled' },
      { ...activeRecord, ID: '4', Status: '' },
    ]))

    assert.deepEqual(records.map(({ id }) => id), ['2', '3'])
  })

  it('drops a record with a missing interval or an inverted one instead of guessing', () => {
    const records = parseNusTickerTapeResponse(tickerTape([
      { ...activeRecord, ID: 'from-missing', Display_From: null },
      { ...activeRecord, ID: 'to-missing', Display_To: '' },
      { ...activeRecord, ID: 'inverted', Display_To: '2026-11-08T00:00:00+08:00' },
      { ...activeRecord, ID: 'unknown-priority', Priority: 'Urgent' },
      { ...activeRecord, ID: 'no-message', Message: '   ' },
    ]))

    assert.deepEqual(records, [])
  })

  it('treats a malformed envelope as a failure rather than an empty announcement list', () => {
    assert.throws(() => parseNusTickerTapeResponse({ code: '00000', data: {} }))
    assert.throws(() => parseNusTickerTapeResponse(null))
    assert.throws(() => parseNusTickerTapeResponse([]))
  })

  it('rejects malformed audience fields instead of treating them as global', () => {
    const records = parseNusTickerTapeResponse(tickerTape([
      { ...activeRecord, Affected_Service_Ids: undefined },
      { ...activeRecord, Affected_Service_Ids: ['D1'] },
      { ...activeRecord, Affected_Service_Ids: 0 },
      { ...activeRecord, Affected_Service_Ids: ',' },
    ]))
    // An explicitly non-empty token list with no route is malformed, not global.
    assert.deepEqual(records, [])
  })

  it('bounds retained input and requires offset timestamps and a successful envelope', () => {
    assert.throws(() => parseNusTickerTapeResponse(tickerTape(Array(2_001).fill(activeRecord))))
    assert.throws(() => parseNusTickerTapeResponse({ code: '10000', data: { TickerTape: [] } }))
    assert.deepEqual(parseNusTickerTapeResponse(tickerTape([
      { ...activeRecord, Message: 'x'.repeat(4_097) },
      { ...activeRecord, Display_From: '2026-11-08T16:55:00' },
    ])), [])
  })


  it('returns an empty list for a valid envelope with no records', () => {
    assert.deepEqual(parseNusTickerTapeResponse(tickerTape([])), [])
  })

  it('posts an empty extra body to the ticker-tape proxy endpoint with the shared headers', async () => {
    const requests: NusApiRequest[] = []
    const client: NusAuthenticatedClient = {
      async requestJson(factory) {
        requests.push(factory({ token: 'session-token', userId: 'session-user', domain: 'PUBLIC' }))
        return tickerTape()
      },
    }
    const announcements = createNusServiceAnnouncementProvider({
      provider,
      client,
      deviceId: 'backend-device',
      retryAttempts: 0,
      retryBaseDelayMs: 0,
    })

    const records = await announcements.load(new AbortController().signal)

    assert.equal(records.length, 1)
    assert.equal(requests[0]?.url, 'https://bus-proxy.nus.example/univus/api/bus-proxy/ticker-tapes')
    assert.equal(requests[0]?.init.method, 'POST')
    const body = JSON.parse(String(requests[0]?.init.body)) as Record<string, unknown>
    assert.equal(body.token, 'session-token')
    assert.equal(body.deviceid, 'backend-device')
    assert.equal('busstopname' in body, false)
  })

  it('retries a transient failure through the shared authenticated client', async () => {
    let attempts = 0
    const client = createNusAuthenticatedClient({
      accessTokenUrl: provider.accessTokenUrl,
      htdApi: provider.htdApi,
      appApi: provider.appApi,
      deviceId: 'backend-device',
      ipaddr: provider.ipaddr,
      version: provider.version,
      initialToken: 'test-token',
      initialUserId: 'test-user',
      requestTimeoutMs: 100,
      fetcher: async () => {
        attempts += 1
        if (attempts === 1) {
          return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })
        }
        return new Response(JSON.stringify(tickerTape()), { status: 200 })
      },
    })
    const announcements = createNusServiceAnnouncementProvider({
      provider,
      client,
      deviceId: 'backend-device',
      retryAttempts: 1,
      retryBaseDelayMs: 0,
    })

    assert.equal((await announcements.load(new AbortController().signal)).length, 1)
    assert.equal(attempts, 2)
  })
})
