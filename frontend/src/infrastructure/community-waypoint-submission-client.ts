import type {
  CommunityWaypointSubmission,
  CommunityWaypointSubmissionReceipt,
} from '@nusgo/shared'
import { CommunityWaypointSubmissionError } from '../domain/waypoints/community-waypoint-submission'
import { buildApiUrl } from './api/api-url'

const SUBMISSION_PATH = '/api/community-waypoint-submissions'

export type CommunityWaypointSubmitter = (
  submission: CommunityWaypointSubmission,
  signal: AbortSignal,
) => Promise<void>

export function createCommunityWaypointSubmissionClient(options: {
  readonly endpoint?: string
  readonly fetcher?: typeof fetch
} = {}): CommunityWaypointSubmitter {
  const endpoint = options.endpoint ?? buildApiUrl(SUBMISSION_PATH)
  const fetcher = options.fetcher ?? fetch

  return async (submission, signal) => {
    let response: Response
    try {
      response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submission),
        signal,
      })
    } catch {
      if (signal.aborted) throw new DOMException('Submission was cancelled', 'AbortError')
      throw new CommunityWaypointSubmissionError('network')
    }

    if (response.status !== 202) {
      await response.body?.cancel()
      const kind = response.status === 400 || response.status === 413
        ? 'invalid'
        : response.status === 429
          ? 'rate-limited'
          : 'unavailable'
      throw new CommunityWaypointSubmissionError(kind)
    }

    let receipt: unknown
    try {
      receipt = await response.json()
    } catch {
      throw new CommunityWaypointSubmissionError('unavailable')
    }
    if (!isSubmissionReceipt(receipt)) throw new CommunityWaypointSubmissionError('unavailable')
  }
}

function isSubmissionReceipt(value: unknown): value is CommunityWaypointSubmissionReceipt {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'status' in value && value.status === 'received'
}
