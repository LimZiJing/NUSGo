import { describe, expect, it, vi } from 'vitest'
import type { CommunityWaypointSubmission } from '@nusgo/shared'
import { CommunityWaypointSubmissionError } from '../domain/waypoints/community-waypoint-submission'
import {
  createCommunityWaypointSubmissionClient,
} from './community-waypoint-submission-client'

const submission: CommunityWaypointSubmission = {
  kind: 'new-place',
  name: 'Water station',
  category: 'water_cooler',
  longitude: 103.78,
  latitude: 1.29,
  details: 'Near the west entrance.',
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
    const signal = new AbortController().signal

    await submit(submission, signal)

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, request] = fetcher.mock.calls[0]
    expect(url).toBe('/api/community-waypoint-submissions')
    expect(request?.method).toBe('POST')
    expect(new Headers(request?.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(String(request?.body))).toEqual(submission)
    expect(request?.signal).toBe(signal)
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
})
