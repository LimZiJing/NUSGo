import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchWithRetry } from './retry.ts'

function response(status: number): Response {
  return new Response('{}', { status })
}

describe('fetchWithRetry', () => {
  it('retries transient upstream responses within the configured limit', async () => {
    let calls = 0
    const fetcher: typeof fetch = async () => {
      calls += 1
      return response(calls === 1 ? 503 : 200)
    }

    const result = await fetchWithRetry(fetcher, 'https://provider.example.test/data', {}, {
      timeoutMs: 100,
      retryAttempts: 1,
      retryBaseDelayMs: 0,
    })

    assert.equal(result.status, 200)
    assert.equal(calls, 2)
  })

  it('returns permanent client errors without retrying', async () => {
    let calls = 0
    const fetcher: typeof fetch = async () => {
      calls += 1
      return response(400)
    }

    const result = await fetchWithRetry(fetcher, 'https://provider.example.test/data', {}, {
      timeoutMs: 100,
      retryAttempts: 2,
      retryBaseDelayMs: 0,
    })

    assert.equal(result.status, 400)
    assert.equal(calls, 1)
  })

  it('aborts an in-flight retry delay during shutdown', async () => {
    const controller = new AbortController()
    let calls = 0
    const fetcher: typeof fetch = async () => {
      calls += 1
      return response(503)
    }
    const request = fetchWithRetry(fetcher, 'https://provider.example.test/data', {}, {
      timeoutMs: 100,
      retryAttempts: 2,
      retryBaseDelayMs: 10_000,
      signal: controller.signal,
    })
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()

    await assert.rejects(request, { name: 'AbortError' })
    assert.equal(calls, 1)
  })
})
