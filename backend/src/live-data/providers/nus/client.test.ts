import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createNusAuthenticatedClient,
  NusSessionExpiredError,
  parseNusAccessTokenResponse,
} from './client.ts'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('NUS authenticated client', () => {
  it('validates a token response and refreshes an expired session once', async () => {
    assert.deepEqual(parseNusAccessTokenResponse({
      data: { token: 'new-token', userid: 'new-user', domain: 'PUBLIC' },
    }), { session: { token: 'new-token', userId: 'new-user', domain: 'PUBLIC' } })

    const calls: string[] = []
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/token')) return jsonResponse({ data: { token: 'new-token', userid: 'user', domain: 'PUBLIC' } })
      if (calls.filter((call) => call.endsWith('/bus')).length === 1) return jsonResponse({ code: '10011' })
      return jsonResponse({ data: { routes: [] } })
    }
    const client = createNusAuthenticatedClient({
      accessTokenUrl: 'https://provider.example.test/token',
      htdApi: 'htd-secret',
      appApi: 'app-secret',
      deviceId: 'backend-device',
      ipaddr: '0.0.0.0',
      version: 'test-version',
      requestTimeoutMs: 100,
      fetcher,
    })

    const result = await client.requestJson(() => ({
      url: 'https://provider.example.test/bus',
      init: { method: 'POST' },
    }), 'bus')

    assert.deepEqual(result, { data: { routes: [] } })
    assert.equal(calls.filter((call) => call.endsWith('/token')).length, 2)
    assert.equal(calls.filter((call) => call.endsWith('/bus')).length, 2)
  })

  it('stops retrying when the refreshed session is also expired', async () => {
    let busRequests = 0
    const fetcher: typeof fetch = async (input) => {
      if (String(input).endsWith('/token')) {
        return jsonResponse({ data: { token: 'token', userid: 'user', domain: 'PUBLIC' } })
      }
      busRequests += 1
      return jsonResponse({ code: '10011' })
    }
    const client = createNusAuthenticatedClient({
      accessTokenUrl: 'https://provider.example.test/token',
      htdApi: 'htd-secret',
      appApi: 'app-secret',
      deviceId: 'device',
      ipaddr: '0.0.0.0',
      version: 'test',
      initialToken: 'old',
      initialUserId: 'user',
      fetcher,
    })

    await assert.rejects(client.requestJson(() => ({
      url: 'https://provider.example.test/bus',
      init: {},
    }), 'bus'), NusSessionExpiredError)
    assert.equal(busRequests, 2)
  })

  it('propagates cancellation to the upstream request', async () => {
    let upstreamAborted = false
    const fetcher: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        upstreamAborted = true
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })
    const client = createNusAuthenticatedClient({
      accessTokenUrl: 'https://provider.example.test/token',
      htdApi: 'htd',
      appApi: 'app',
      deviceId: 'device',
      ipaddr: '0.0.0.0',
      version: 'test',
      initialToken: 'token',
      initialUserId: 'user',
      requestTimeoutMs: 100,
      fetcher,
    })
    const controller = new AbortController()
    const request = client.requestJson(() => ({
      url: 'https://provider.example.test/bus',
      init: {},
    }), 'bus', controller.signal)
    await Promise.resolve()
    controller.abort()

    await assert.rejects(request, { name: 'AbortError' })
    assert.equal(upstreamAborted, true)
  })
})
