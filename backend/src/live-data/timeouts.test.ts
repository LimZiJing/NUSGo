import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchWithTimeout, UpstreamTimeoutError } from './timeouts.ts'

describe('fetchWithTimeout', () => {
  it('aborts an upstream request that exceeds its time limit', async () => {
    let aborted = false
    const fetcher: typeof fetch = async (_url, init) => new Promise<Response>((_resolveResponse, rejectResponse) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true
        rejectResponse(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })

    await assert.rejects(
      fetchWithTimeout(fetcher, 'https://provider.example.test/data', {}, 25),
      UpstreamTimeoutError,
    )
    assert.equal(aborted, true)
  })

  it('keeps the time limit active while reading the provider response body', async () => {
    let aborted = false
    const fetcher: typeof fetch = async (_url, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener('abort', () => {
            aborted = true
            controller.error(new DOMException('Aborted', 'AbortError'))
          }, { once: true })
        },
      })
      return new Response(stream, { status: 200 })
    }
    const response = await fetchWithTimeout(
      fetcher,
      'https://provider.example.test/data',
      {},
      25,
    )

    await assert.rejects(response.json(), UpstreamTimeoutError)
    assert.equal(aborted, true)
  })
})
