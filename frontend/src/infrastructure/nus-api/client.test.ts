import { describe, expect, it, vi } from 'vitest'
import {
  createNusAuthenticatedClient,
  NusAuthenticationError,
  NusSessionExpiredError,
  parseNusAccessTokenResponse,
} from './client'

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function createClient(fetcher: typeof fetch, initialToken = 'old-token') {
  return createNusAuthenticatedClient({
    accessTokenUrl: 'https://token.example.test/access-token',
    htdApi: 'htd-api',
    appApi: 'app-api',
    deviceId: 'device-id',
    ipaddr: '0.0.0.0',
    version: 'univus_android_2.59.2_140',
    initialToken,
    initialUserId: 'old-user',
    fetcher,
  })
}

describe('parseNusAccessTokenResponse', () => {
  it('validates and returns the refreshed session', () => {
    expect(parseNusAccessTokenResponse({
      code: '00000',
      data: {
        username: 'User',
        token: 'new-token',
        userid: 'new-user',
        domain: 'PUBLIC',
      },
    })).toEqual({
      session: { token: 'new-token', userId: 'new-user', domain: 'PUBLIC' },
    })
  })

  it('rejects a response without a usable token', () => {
    expect(() => parseNusAccessTokenResponse({ data: {} })).toThrow(NusAuthenticationError)
  })
})

describe('createNusAuthenticatedClient', () => {
  it('refreshes once after code 10011 and retries with the new session', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ code: '10011', msg: 'The session has expired' }))
      .mockResolvedValueOnce(response({
        code: '00000',
        data: { token: 'new-token', userid: 'new-user', domain: 'PUBLIC' },
      }))
      .mockResolvedValueOnce(response({ ok: true }))
    const client = createClient(fetcher)

    const result = await client.requestJson((session) => ({
      url: 'https://api.example.test/resource',
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ token: session.token, userid: session.userId }),
      },
    }), 'resource')

    expect(result).toEqual({ ok: true })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://token.example.test/access-token')
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        accept: 'application/json',
        'X-HTD-API': 'htd-api',
        'X-APP-API': 'app-api',
      },
      body: JSON.stringify({
        deviceid: 'device-id',
        ipaddr: '0.0.0.0',
        version: 'univus_android_2.59.2_140',
      }),
    })
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer new-token' },
      body: JSON.stringify({ token: 'new-token', userid: 'new-user' }),
    })
  })

  it('shares one refresh across concurrent expired requests', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ code: '10011' }))
      .mockResolvedValueOnce(response({ code: '10011' }))
      .mockResolvedValueOnce(response({
        data: { token: 'new-token', userid: 'new-user', domain: 'PUBLIC' },
      }))
      .mockResolvedValueOnce(response({ first: true }))
      .mockResolvedValueOnce(response({ second: true }))
    const client = createClient(fetcher)
    const request = (name: string) => client.requestJson((session) => ({
      url: `https://api.example.test/${name}`,
      init: { headers: { Authorization: `Bearer ${session.token}` } },
    }), name)

    const results = await Promise.all([request('first'), request('second')])

    expect(results).toEqual([{ first: true }, { second: true }])
    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(fetcher.mock.calls.filter(([url]) => url === 'https://token.example.test/access-token')).toHaveLength(1)
  })

  it('stops after one retry when the refreshed session is also expired', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ code: '10011' }))
      .mockResolvedValueOnce(response({ data: { token: 'new-token', userid: 'new-user', domain: 'PUBLIC' } }))
      .mockResolvedValueOnce(response({ code: '10011' }))
    const client = createClient(fetcher)

    await expect(client.requestJson(() => ({
      url: 'https://api.example.test/resource',
      init: {},
    }), 'resource')).rejects.toThrow(NusSessionExpiredError)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('gets a token before the first request when no bootstrap token is configured', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ data: { token: 'new-token', userid: 'new-user', domain: 'PUBLIC' } }))
      .mockResolvedValueOnce(response({ ok: true }))
    const client = createClient(fetcher, '')

    await client.requestJson((session) => ({
      url: 'https://api.example.test/resource',
      init: { headers: { Authorization: `Bearer ${session.token}` } },
    }), 'resource')

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer new-token' },
    })
  })
})
