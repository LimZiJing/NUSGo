import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, describe, it } from 'node:test'
import { createApp } from './http/app.ts'
import { closeHttpServer, listenHttpServer } from './server.ts'

const origin = 'http://localhost:5173'
const appConfig = { corsOrigins: [origin], dataVersion: 'development' }
const listeningServers: Awaited<ReturnType<typeof listenHttpServer>>[] = []

async function start(): Promise<{ baseUrl: string; server: Awaited<ReturnType<typeof listenHttpServer>> }> {
  const server = await listenHttpServer(createApp(appConfig, null), '127.0.0.1', 0)
  const address = server.address() as AddressInfo
  listeningServers.push(server)
  return { baseUrl: `http://127.0.0.1:${address.port}`, server }
}

after(async () => {
  await Promise.all(listeningServers.map((server) => closeHttpServer(server)))
})

describe('Express API foundation', () => {
  it('reports process health separately from canonical-data readiness', async () => {
    const { baseUrl } = await start()
    const health = await fetch(`${baseUrl}/api/health`)
    const ready = await fetch(`${baseUrl}/api/ready`)

    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { status: 'ok', dataVersion: 'development' })
    assert.equal(ready.status, 503)
    assert.deepEqual(await ready.json(), {
      status: 'not-ready',
      dataVersion: 'development',
      canonicalDataReady: false,
      liveSnapshotReady: false,
      error: 'Canonical data is not ready',
    })
  })

  it('answers only allowed CORS preflights and rejects unknown origins', async () => {
    const { baseUrl } = await start()
    const preflight = await fetch(`${baseUrl}/api/ready`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    const blocked = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://not-allowed.example' },
    })

    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
    assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /POST/)
    assert.equal(blocked.status, 403)
    assert.equal(blocked.headers.get('access-control-allow-origin'), null)
    assert.deepEqual(await blocked.json(), { error: 'Origin is not allowed' })
  })

  it('returns safe JSON errors with CORS headers for malformed and oversized bodies', async () => {
    const { baseUrl } = await start()
    const malformed = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{',
    })
    const oversized = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(40_000) }),
    })

    assert.equal(malformed.status, 400)
    assert.equal(malformed.headers.get('access-control-allow-origin'), origin)
    assert.deepEqual(await malformed.json(), { error: 'Request body is not valid JSON' })
    assert.equal(oversized.status, 413)
    assert.deepEqual(await oversized.json(), { error: 'Request body is too large' })
  })

  it('returns a bounded safe response for unknown API routes', async () => {
    const { baseUrl } = await start()
    const response = await fetch(`${baseUrl}/api/private-details`)

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'API route not found', code: 'invalid_request' })
    assert.equal(response.headers.get('x-powered-by'), null)
  })

  it('stops accepting requests after graceful shutdown', async () => {
    const { baseUrl, server } = await start()
    await closeHttpServer(server, 100)

    await assert.rejects(fetch(`${baseUrl}/api/health`))
  })
})
