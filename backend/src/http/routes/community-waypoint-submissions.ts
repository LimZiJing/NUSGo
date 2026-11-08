import type { Express } from 'express'
import { InvalidCommunityWaypointSubmissionError, parseCommunityWaypointSubmission, type CommunityWaypointSubmission } from '../validation/community-waypoint-submission.ts'
import { sendApiError } from '../error-response.ts'
import { createClientRateLimiter } from '../rate-limiter.ts'

const SUBMISSION_PATH = '/api/community-waypoint-submissions'
const PRIVATE_SUBMISSIONS_ISSUES_URL = 'https://api.github.com/repos/LimZiJing/NUSGo-waypoint-submissions/issues'
const SUBMISSION_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000
const SUBMISSION_RATE_LIMIT_MAX_REQUESTS = 3
const SUBMISSION_TIMEOUT_MS = 8_000

export interface PrivateSubmissionIssueDraft {
  readonly title: string
  readonly body: string
  readonly labels: readonly string[]
}

export type PrivateSubmissionIssueWriter = (
  issue: PrivateSubmissionIssueDraft,
  signal: AbortSignal,
) => Promise<void>

function cleanMarkdownText(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replaceAll('@', '@\u200b')
    .replace(/[\\*_{}\x5B\x5D()#+!|<>~]/g, '\\$&')
    .replaceAll(String.fromCharCode(96), '&#96;')
}

function formatIssueField(label: string, value: string | number): string {
  return '**' + label + ':** ' + cleanMarkdownText(String(value))
}

function optionalValue(value: string | number | undefined, fallback: string): string {
  return value === undefined ? fallback : String(value)
}

export function createPrivateSubmissionIssueDraft(
  submission: CommunityWaypointSubmission,
): PrivateSubmissionIssueDraft {
  let kindDisplay: string
  let kindLabel: string
  let category: string
  let name: string
  let longitude: string
  let latitude: string
  let building: string
  let floor: string
  let details: string
  let correction: string
  let removal: string
  let evidence: string
  let titleSuffix: string

  if (submission.kind === 'new-place') {
    kindDisplay = 'New place'
    kindLabel = 'kind:new-place'
    category = submission.category
    name = submission.name
    longitude = String(submission.longitude)
    latitude = String(submission.latitude)
    building = optionalValue(submission.building, 'Not provided')
    floor = optionalValue(submission.floor, 'Not provided')
    details = [submission.accessibilityNote, submission.details].filter(Boolean).join(' — ') || 'Not provided'
    correction = 'N/A'
    removal = 'N/A'
    evidence = submission.explanation === undefined
      ? 'Not provided; maintainer must verify independently'
      : 'Unverified submitter note: ' + submission.explanation
    titleSuffix = cleanMarkdownText(submission.name)
  } else if (submission.kind === 'correction') {
    kindDisplay = 'Correction'
    kindLabel = 'kind:correction'
    category = optionalValue(submission.category, 'No change proposed')
    name = optionalValue(submission.name, 'No change proposed')
    longitude = optionalValue(submission.longitude, 'No change proposed')
    latitude = optionalValue(submission.latitude, 'No change proposed')
    building = optionalValue(submission.building, 'No change proposed')
    floor = optionalValue(submission.floor, 'No change proposed')
    details = [submission.accessibilityNote, submission.details].filter(Boolean).join(' — ') || 'No change proposed'
    correction = submission.waypointId + ' — ' + submission.requestedChange
    removal = 'N/A'
    evidence = 'Not provided; maintainer must verify independently'
    titleSuffix = submission.waypointId
  } else {
    kindDisplay = 'Removal'
    kindLabel = 'kind:removal'
    category = 'N/A'
    name = 'N/A'
    longitude = 'N/A'
    latitude = 'N/A'
    building = 'N/A'
    floor = 'N/A'
    details = 'N/A'
    correction = 'N/A'
    removal = submission.waypointId + ' — ' + submission.reason
    evidence = 'Not provided; maintainer must verify independently'
    titleSuffix = submission.waypointId
  }

  const lines = [
    formatIssueField('Kind', kindDisplay),
    formatIssueField('Kind label', kindLabel),
    formatIssueField('Requested category', category),
    formatIssueField('Suggested name (new place)', name),
    formatIssueField('Longitude (new place or correction)', longitude),
    formatIssueField('Latitude (new place or correction)', latitude),
    formatIssueField('Building or nearby landmark (optional)', building),
    formatIssueField('Floor (optional)', floor),
    formatIssueField('Accessibility and other details (optional)', details),
    formatIssueField('For a correction, public waypoint ID and requested change', correction),
    formatIssueField('For a removal, public waypoint ID and reason', removal),
    formatIssueField('Evidence summary and public source wording, if approved', evidence),
    formatIssueField('Private photo evidence IDs', 'Disabled at launch'),
  ]

  return {
    title: '[' + submission.kind + '] ' + titleSuffix,
    body: [
      '> Anonymous NUSGo submission. All submitted details are unverified until maintainer review.',
      '',
      '## Submission',
      '',
      ...lines,
      '',
      '## Maintainer review',
      '',
      '- [ ] Kind label and exactly one review-state label are set',
      '- [ ] Category and Singapore coordinate bounds are valid',
      '- [ ] NUS location eligibility is confirmed',
      '- [ ] Checked against published waypoints and open submissions',
      '- [ ] Location and details are verified or marked for a field check',
      '- [ ] Correction keeps its existing waypoint ID; removal ID will never be reused',
      '- [ ] If approved, cleaned public GeoJSON change and public provenance are reviewed and published',
      '- [ ] Private issue URL, raw text, reviewer notes, reporter identity, and photo IDs are excluded from the public change',
      '- [ ] Approved, rejected, duplicate, or outdated outcome is recorded with reason and date',
      '- [ ] Photo retention and orphan cleanup are handled before closure, if private photo evidence was accepted',
    ].join('\n'),
    labels: ['kind:' + submission.kind, 'review:new'],
  }
}
export function createPrivateSubmissionIssueWriter(
  token: string | null,
  fetcher: typeof fetch = fetch,
): PrivateSubmissionIssueWriter | null {
  const credential = token?.trim()
  if (!credential) return null

  return async (issue, signal) => {
    const response = await fetcher(PRIVATE_SUBMISSIONS_ISSUES_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + credential,
        'Content-Type': 'application/json',
        'User-Agent': 'NUSGo-Community-Waypoints',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: issue.title,
        body: issue.body,
        labels: [...issue.labels],
      }),
      signal,
    })
    await response.body?.cancel()
    if (!response.ok) throw new Error('Private submission issue could not be created')
  }
}

export function registerCommunityWaypointSubmissionRoute(
  app: Express,
  writer: PrivateSubmissionIssueWriter | null,
): void {
  app.route(SUBMISSION_PATH)
    .post(
      createClientRateLimiter({
        windowMs: SUBMISSION_RATE_LIMIT_WINDOW_MS,
        maxRequests: SUBMISSION_RATE_LIMIT_MAX_REQUESTS,
        message: 'Community Waypoint submission rate limit reached',
      }),
      async (request, response) => {
        let submission: CommunityWaypointSubmission
        try {
          submission = parseCommunityWaypointSubmission(request.body)
        } catch (error: unknown) {
          if (error instanceof InvalidCommunityWaypointSubmissionError) {
            sendApiError(response, 400, error.message, 'invalid_request')
            return
          }
          sendApiError(response, 400, 'Submission is not valid', 'invalid_request')
          return
        }

        if (!writer) {
          sendApiError(response, 503, 'Submissions are not available', 'not_ready')
          return
        }

        const controller = new AbortController()
        let disconnected = false
        const abortForDisconnect = () => {
          if (!response.writableEnded) {
            disconnected = true
            controller.abort()
          }
        }
        const timeout = setTimeout(() => controller.abort(), SUBMISSION_TIMEOUT_MS)
        request.once('aborted', abortForDisconnect)
        response.once('close', abortForDisconnect)
        try {
          await writer(createPrivateSubmissionIssueDraft(submission), controller.signal)
          if (!controller.signal.aborted && !response.writableEnded) {
            response.status(202).json({ status: 'received' })
          }
        } catch {
          if (!disconnected && !request.aborted && !response.writableEnded) {
            sendApiError(response, 503, 'Submission could not be received; try again later')
          }
        } finally {
          clearTimeout(timeout)
          request.removeListener('aborted', abortForDisconnect)
          response.removeListener('close', abortForDisconnect)
        }
      },
    )
    .all((_request, response) => {
      response.setHeader('Allow', 'POST, OPTIONS')
      sendApiError(response, 405, 'Only POST is supported', 'invalid_request')
    })
}
