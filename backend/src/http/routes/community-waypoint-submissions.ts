import type { Express } from 'express'
import {
  getCommunityWaypointCategoryLabel as getCategoryLabel,
  COMMUNITY_WAYPOINT_PRINTING_SERVICES,
  COMMUNITY_WAYPOINT_VENDING_ITEMS,
  COMMUNITY_WAYPOINT_VENDING_PREP_OPTIONS,
  type CommunityWaypointDetailsSuggestion,
} from '@nusgo/shared/waypoints/community'
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
  return '- **' + label + ':** ' + cleanMarkdownText(String(value))
}

function getOptionLabels<T extends string>(
  values: readonly T[] | null | undefined,
  options: readonly { readonly value: T; readonly label: string }[],
): string {
  if (values === undefined || values === null) return 'Not provided'
  if (values.length === 0) return 'None (cleared)'
  return values.map((value) => options.find((option) => option.value === value)?.label ?? value).join(', ')
}

function formatPriceCents(value: number | null): string {
  return value === null ? 'Not provided' : `S$${(value / 100).toFixed(2)}`
}

function getSuggestedDetailsSummary(details: CommunityWaypointDetailsSuggestion): string {
  if (details.category === 'printing') {
    return [
      'Services: ' + getOptionLabels(details.services, COMMUNITY_WAYPOINT_PRINTING_SERVICES),
      'Colour available: ' + (details.colour === null ? 'Not provided' : details.colour ? 'Yes' : 'No'),
      'Grayscale price per page: ' + formatPriceCents(details.grayscalePriceCentsPerPage),
      'Colour price per page: ' + formatPriceCents(details.colourPriceCentsPerPage),
    ].join('; ')
  }
  if (details.category === 'toilet') {
    return 'Bidet available: ' + (details.bidet === null ? 'Not provided' : details.bidet ? 'Yes' : 'No')
  }
  return [
    'Items: ' + getOptionLabels(details.items, COMMUNITY_WAYPOINT_VENDING_ITEMS),
    'Prep: ' + getOptionLabels(details.prep, COMMUNITY_WAYPOINT_VENDING_PREP_OPTIONS),
  ].join('; ')
}

function getSuggestedDetailsLines(details: CommunityWaypointDetailsSuggestion): readonly string[] {
  if (details.category === 'printing') {
    return [
      formatIssueField('Category', getCategoryLabel(details.category)),
      formatIssueField('Services', getOptionLabels(details.services, COMMUNITY_WAYPOINT_PRINTING_SERVICES)),
      formatIssueField('Colour available', details.colour === null ? 'Not provided' : details.colour ? 'Yes' : 'No'),
      formatIssueField('Grayscale price per page', formatPriceCents(details.grayscalePriceCentsPerPage)),
      formatIssueField('Colour price per page', formatPriceCents(details.colourPriceCentsPerPage)),
    ]
  }
  if (details.category === 'toilet') {
    return [
      formatIssueField('Category', getCategoryLabel(details.category)),
      formatIssueField('Bidet available', details.bidet === null ? 'Not provided' : details.bidet ? 'Yes' : 'No'),
    ]
  }
  return [
    formatIssueField('Category', getCategoryLabel(details.category)),
    formatIssueField('Items', getOptionLabels(details.items, COMMUNITY_WAYPOINT_VENDING_ITEMS)),
    formatIssueField('Prep', getOptionLabels(details.prep, COMMUNITY_WAYPOINT_VENDING_PREP_OPTIONS)),
  ]
}

function getIssueTitle(submission: CommunityWaypointSubmission): string {
  if (submission.kind === 'new-place') {
    return '[New place] ' + getCategoryLabel(submission.category) + ' waypoint'
  }
  const kind = submission.kind === 'correction' ? 'Correction' : 'Removal'
  return '[' + kind + '] ' + submission.waypointId
}

function formatCoordinate(value: number, positiveDirection: string, negativeDirection: string): string {
  return `${Math.abs(value).toFixed(6)}° ${value < 0 ? negativeDirection : positiveDirection}`
}

function formatCoordinatePair(latitude: number, longitude: number): string {
  return `${formatCoordinate(latitude, 'N', 'S')}, ${formatCoordinate(longitude, 'E', 'W')}`
}

function locationSummary(latitude: number, longitude: number): string {
  const mapUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=19/${latitude}/${longitude}`
  return `${formatCoordinatePair(latitude, longitude)} ([open map](${mapUrl}))`
}

function getSummaryRows(submission: CommunityWaypointSubmission): readonly (readonly [string, string])[] {
  if (submission.kind === 'new-place') {
    return [
      ['Report', 'New place'],
      ['Category', getCategoryLabel(submission.category)],
      ['Location', locationSummary(submission.latitude, submission.longitude)],
      ...(submission.building === undefined ? [] : [['Building', submission.building] as const]),
      ...(submission.floor === undefined ? [] : [['Floor', String(submission.floor)] as const]),
      ...(submission.suggestedDetails === undefined
        ? []
        : [['More details', getSuggestedDetailsSummary(submission.suggestedDetails)] as const]),
    ]
  }
  if (submission.kind === 'correction') {
    return [
      ['Report', 'Correction'],
      ['Waypoint ID', submission.waypointId],
      ...(submission.category === undefined ? [] : [['Proposed category', getCategoryLabel(submission.category)] as const]),
      ...(submission.latitude === undefined || submission.longitude === undefined
        ? []
        : [['Proposed location', locationSummary(submission.latitude, submission.longitude)] as const]),
      ...(submission.building === undefined ? [] : [['Proposed building', submission.building] as const]),
      ...(submission.floor === undefined ? [] : [['Proposed floor', String(submission.floor)] as const]),
      ...(submission.suggestedDetails === undefined
        ? []
        : [['More details', getSuggestedDetailsSummary(submission.suggestedDetails)] as const]),
    ]
  }
  return [
    ['Report', 'Removal'],
    ['Waypoint ID', submission.waypointId],
  ]
}

function getSubmissionDetailLines(submission: CommunityWaypointSubmission): readonly string[] {
  if (submission.kind === 'new-place') {
    return [
      formatIssueField('Category', getCategoryLabel(submission.category)),
      formatIssueField('Coordinates', formatCoordinatePair(submission.latitude, submission.longitude)),
      formatIssueField('Building or nearby landmark', submission.building ?? 'Not provided'),
      formatIssueField('Floor', submission.floor ?? 'Not provided'),
      formatIssueField('Submitter explanation', submission.explanation ?? 'Not provided'),
      ...(submission.suggestedDetails === undefined
        ? []
        : ['', '### More details', '', ...getSuggestedDetailsLines(submission.suggestedDetails)]),
    ]
  }
  if (submission.kind === 'correction') {
    const proposedFields = [
      ...(submission.category === undefined ? [] : [formatIssueField('Proposed category', getCategoryLabel(submission.category))]),
      ...(submission.latitude === undefined || submission.longitude === undefined
        ? []
        : [formatIssueField('Proposed coordinates', formatCoordinatePair(submission.latitude, submission.longitude))]),
      ...(submission.building === undefined ? [] : [formatIssueField('Proposed building', submission.building)]),
      ...(submission.floor === undefined ? [] : [formatIssueField('Proposed floor', submission.floor)]),
    ]
    return [
      formatIssueField('Public waypoint ID', submission.waypointId),
      formatIssueField('Requested change', submission.requestedChange),
      ...(proposedFields.length === 0 ? [] : ['', '### Proposed field values', '', ...proposedFields]),
      ...(submission.suggestedDetails === undefined
        ? []
        : ['', '### More details', '', ...getSuggestedDetailsLines(submission.suggestedDetails)]),
    ]
  }
  return [
    formatIssueField('Public waypoint ID', submission.waypointId),
    formatIssueField('Removal reason', submission.reason),
  ]
}

function formatSubmissionJson(submission: CommunityWaypointSubmission): string {
  const json = JSON.stringify({ schemaVersion: 1, submission }, null, 2)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
  const longestBacktickRun = Math.max(0, ...[...json.matchAll(/`+/g)].map(([run]) => run.length))
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1))
  return [
    '<details>',
    '<summary>Submission data (schema version 1)</summary>',
    '',
    '<!-- NUSGO_SUBMISSION_JSON_V1_START -->',
    fence + 'json',
    json,
    fence,
    '<!-- NUSGO_SUBMISSION_JSON_V1_END -->',
    '</details>',
  ].join('\n')
}

export function createPrivateSubmissionIssueDraft(
  submission: CommunityWaypointSubmission,
): PrivateSubmissionIssueDraft {
  const summaryTable = [
    '| Field | Summary |',
    '| --- | --- |',
    ...getSummaryRows(submission).map(([field, value]) => {
      const summary = field === 'Location' || field === 'Proposed location'
        ? value
        : cleanMarkdownText(value)
      return `| ${field} | ${summary} |`
    }),
  ]

  return {
    title: getIssueTitle(submission),
    body: [
      '## Summary',
      '',
      ...summaryTable,
      '',
      '## Details',
      '',
      ...getSubmissionDetailLines(submission),
      '',
      formatSubmissionJson(submission),
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
