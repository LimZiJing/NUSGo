import { describe, expect, it } from 'vitest'
import { checkApiDataVersion } from './compatibility'

const DATA_VERSION = 'd'.repeat(40)

function healthResponse(dataVersion: string, status = 200): Response {
  return new Response(JSON.stringify({ status: 'ok', dataVersion }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('API data version compatibility', () => {
  it('checks the backend version against the frontend build version', async () => {
    const requests: string[] = []
    await checkApiDataVersion('https://api.example.test', DATA_VERSION, async (input) => {
      requests.push(String(input))
      return healthResponse(DATA_VERSION)
    })

    expect(requests).toEqual(['https://api.example.test/api/health'])
  })

  it('rejects a backend built from another source revision', async () => {
    await expect(checkApiDataVersion('', DATA_VERSION, async () => healthResponse('e'.repeat(40))))
      .rejects.toThrow('Frontend and backend data versions do not match')
  })

  it('rejects an invalid health payload', async () => {
    await expect(checkApiDataVersion('', DATA_VERSION, async () => new Response('{}')))
      .rejects.toThrow('Backend health response is invalid')
  })
})
