import { describe, expect, it, vi } from 'vitest'
import type { CommunityWaypointSubmission } from '@nusgo/shared'
import { CommunityWaypointSubmissionError } from '../domain/waypoints/community-waypoint-submission'
import {
  createCommunityWaypointSubmissionClient,
} from './community-waypoint-submission-client'

const submission: CommunityWaypointSubmission = {
  kind: 'new-place',
  category: 'water_cooler',
  longitude: 103.78,
  latitude: 1.29,
  explanation: 'Near the west entrance.',
}

describe('community waypoint submission client', () => {
  it('sends a text-only suggestion to the server endpoint and accepts the safe receipt', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ status: 'received' }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    ))
    const submit = createCommunityWaypointSubmissionClient({
      endpoint: '/api/community-waypoint-submissions',
      fetcher,
    })
    const controller = new AbortController()
    const signal = controller.signal

    await submit(submission, signal)

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, request] = fetcher.mock.calls[0]
    expect(url).toBe('/api/community-waypoint-submissions')
    expect(request?.method).toBe('POST')
    expect(new Headers(request?.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(String(request?.body))).toEqual(submission)
    expect(request?.signal).not.toBe(signal)
    expect(request?.signal?.aborted).toBe(false)
  })

  it.each([
    { status: 400, kind: 'invalid' },
    { status: 429, kind: 'rate-limited' },
    { status: 503, kind: 'unavailable' },
  ] as const)('maps HTTP $status to a safe failure state', async ({ status, kind }) => {
    const submit = createCommunityWaypointSubmissionClient({
      endpoint: '/api/community-waypoint-submissions',
      fetcher: async () => new Response(JSON.stringify({ error: 'private server detail' }), { status }),
    })

    let failure: unknown
    try {
      await submit(submission, new AbortController().signal)
    } catch (error: unknown) {
      failure = error
    }

    expect(failure).toBeInstanceOf(CommunityWaypointSubmissionError)
    expect(failure).toMatchObject({ kind })
    expect((failure as Error).message).not.toContain('private server detail')
  })

  it('maps a network failure to a safe retryable state', async () => {
    const submit = createCommunityWaypointSubmissionClient({
      endpoint: '/api/community-waypoint-submissions',
      fetcher: async () => { throw new Error('private network detail') },
    })

    await expect(submit(submission, new AbortController().signal)).rejects.toMatchObject({
      kind: 'network',
      message: 'Community Waypoint submission failed',
    })
  })

  it('aborts a stalled request at its deadline and reports a retryable network error', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const fetcher = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Request aborted', 'AbortError'))
        }, { once: true })
      }))
      const submit = createCommunityWaypointSubmissionClient({
        endpoint: '/api/community-waypoint-submissions',
        fetcher,
      })
      const result = submit(submission, controller.signal).then(
        () => null,
        (error: unknown) => error,
      )

      await vi.advanceTimersByTimeAsync(20_000)

      expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
      await expect(result).resolves.toMatchObject({ kind: 'network' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps caller cancellation as an AbortError', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Request aborted', 'AbortError'))
      }, { once: true })
    }))
    const submit = createCommunityWaypointSubmissionClient({
      endpoint: '/api/community-waypoint-submissions',
      fetcher,
    })
    const result = submit(submission, controller.signal)

    controller.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })
})
