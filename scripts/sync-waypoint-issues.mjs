import { parseCommunityWaypointSubmission } from '../shared/src/waypoints/community-submission-validation.ts'
import { parseCommunityWaypointsGeoJson } from '../shared/src/waypoints/community-geojson.ts'
const ISSUE_MARKER_START = '<!-- NUSGO_SUBMISSION_JSON_V1_START -->'
const ISSUE_MARKER_END = '<!-- NUSGO_SUBMISSION_JSON_V1_END -->'
const ISSUE_REPOSITORY_DEFAULT = 'LimZiJing/NUSGo-waypoint-submissions'
const ISSUE_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const PAGE_SIZE = 100
const KIND_LABELS = new Set(['kind:new-place', 'kind:correction', 'kind:removal'])
const REVIEW_LABELS = new Set([
  'review:new',
  'review:reviewing',
  'review:needs-check',
  'review:approved',
  'review:rejected',
  'review:duplicate',
  'review:outdated',
])
const ACTIVE_REVIEW_LABELS = new Set(['review:new', 'review:reviewing', 'review:needs-check'])
const FINAL_REVIEW_LABELS = new Set(['review:rejected', 'review:duplicate', 'review:outdated'])

function isValidIssueRepository(repository) {
  return typeof repository === 'string' &&
    repository === repository.trim() &&
    ISSUE_REPOSITORY_PATTERN.test(repository) &&
    !repository.split('/').some((segment) => segment === '.' || segment === '..')
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function issueError(issue, message) {
  const number = Number.isSafeInteger(issue?.number) ? 'Issue #' + issue.number + ': ' : ''
  return new Error(number + message)
}

function assertIssueState(issue) {
  if (issue.state !== 'open' && issue.state !== 'closed') {
    throw issueError(issue, 'state must be open or closed')
  }
}

function isPullRequest(issue) {
  if (issue.pull_request === undefined) return false
  if (!isRecord(issue.pull_request)) {
    throw issueError(issue, 'pull_request must be an object when present')
  }
  return true
}

function getIssueLabels(issue) {
  if (!Array.isArray(issue?.labels)) throw issueError(issue, 'labels must be an array')
  return issue.labels.map((label) => {
    if (typeof label === 'string') return label
    if (isRecord(label) && typeof label.name === 'string') return label.name
    throw issueError(issue, 'contains an invalid label')
  })
}

function findSinglePrefixedLabel(issue, labels, prefix, allowed) {
  const matches = labels.filter((label) => label.startsWith(prefix))
  if (matches.length !== 1 || !allowed.has(matches[0])) {
    throw issueError(issue, 'must have exactly one supported ' + prefix.slice(0, -1) + ' label')
  }
  return matches[0]
}

function countFence(line) {
  let count = 0
  while (line[count] === String.fromCharCode(96)) count += 1
  return { count, suffix: line.slice(count).trim() }
}

function readMarkedSubmission(issue) {
  if (typeof issue.body !== 'string') throw issueError(issue, 'body is missing')
  const start = issue.body.indexOf(ISSUE_MARKER_START)
  const end = issue.body.indexOf(ISSUE_MARKER_END)
  if (
    start < 0 ||
    end <= start ||
    issue.body.indexOf(ISSUE_MARKER_START, start + ISSUE_MARKER_START.length) >= 0 ||
    issue.body.indexOf(ISSUE_MARKER_END, end + ISSUE_MARKER_END.length) >= 0
  ) {
    throw issueError(issue, 'must contain one marked submission JSON block')
  }

  const lines = issue.body
    .slice(start + ISSUE_MARKER_START.length, end)
    .trim()
    .split(/\r?\n/)
  const opening = countFence(lines[0] ?? '')
  const closing = countFence(lines.at(-1) ?? '')
  if (
    opening.count < 3 ||
    opening.suffix !== 'json' ||
    closing.count !== opening.count ||
    closing.suffix !== '' ||
    lines.length < 3
  ) {
    throw issueError(issue, 'has an invalid marked JSON fence')
  }

  let payload
  try {
    payload = JSON.parse(lines.slice(1, -1).join('\n'))
  } catch {
    throw issueError(issue, 'contains invalid submission JSON')
  }
  if (
    !isRecord(payload) ||
    payload.schemaVersion !== 1 ||
    Object.keys(payload).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(payload, 'submission')
  ) {
    throw issueError(issue, 'uses an unsupported submission schema')
  }

  try {
    return parseCommunityWaypointSubmission(payload.submission)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'submission is invalid'
    throw issueError(issue, reason)
  }
}

function getCoordinateFeature(issue, submission, reviewState, reviewRole, coordinate, category, targetWaypointId, issueRepository) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [coordinate.longitude, coordinate.latitude],
    },
    properties: {
      issueNumber: issue.number,
      issueUrl: 'https://github.com/' + issueRepository + '/issues/' + issue.number,
      kind: submission.kind,
      reviewState: reviewState.slice('review:'.length),
      reviewRole,
      ...(category === undefined ? {} : { category }),
      ...(targetWaypointId === undefined ? {} : { targetWaypointId }),
    },
  }
}

function getIssueFeatures(issue, submission, reviewState, waypointsById, issueRepository) {
  if (submission.kind === 'new-place') {
    return [
      getCoordinateFeature(
        issue,
        submission,
        reviewState,
        'proposed',
        { longitude: submission.longitude, latitude: submission.latitude },
        submission.category,
        undefined,
        issueRepository,
      ),
    ]
  }

  const current = waypointsById.get(submission.waypointId)
  if (!current) {
    throw issueError(issue, 'targets a Community Waypoint that is not in the public dataset')
  }

  const currentFeature = getCoordinateFeature(
    issue,
    submission,
    reviewState,
    'current',
    current.coordinate,
    current.category,
    submission.waypointId,
    issueRepository,
  )
  if (submission.kind === 'removal') return [currentFeature]

  if (submission.longitude === undefined || submission.latitude === undefined) {
    return [currentFeature]
  }

  return [
    currentFeature,
    getCoordinateFeature(
      issue,
      submission,
      reviewState,
      'proposed',
      { longitude: submission.longitude, latitude: submission.latitude },
      submission.category ?? current.category,
      submission.waypointId,
      issueRepository,
    ),
  ]
}
function emptyCollection() {
  return { type: 'FeatureCollection', features: [] }
}

export function buildReviewGeoJson(issues, publicWaypoints, issueRepository = ISSUE_REPOSITORY_DEFAULT) {
  if (!isValidIssueRepository(issueRepository)) {
    throw new Error('A valid issue repository is required')
  }
  if (!Array.isArray(issues)) throw new Error('Issues must be an array')
  const waypointsById = new Map(publicWaypoints.map((waypoint) => [waypoint.id, waypoint]))
  const toReview = emptyCollection()
  const approved = emptyCollection()
  const openIssues = []
  for (const issue of issues) {
    if (!isRecord(issue)) throw new Error('Issues must contain issue objects')
    assertIssueState(issue)
    if (issue.state !== 'open' || isPullRequest(issue)) continue
    openIssues.push(issue)
  }
  const sortedIssues = openIssues.sort((left, right) => left.number - right.number)
  for (const issue of sortedIssues) {
    if (!Number.isSafeInteger(issue.number) || issue.number < 1) {
      throw issueError(issue, 'has an invalid issue number')
    }
    const labels = getIssueLabels(issue)
    const kindLabel = findSinglePrefixedLabel(issue, labels, 'kind:', KIND_LABELS)
    const reviewState = findSinglePrefixedLabel(issue, labels, 'review:', REVIEW_LABELS)
    if (FINAL_REVIEW_LABELS.has(reviewState)) continue

    const submission = readMarkedSubmission(issue)
    if (kindLabel !== 'kind:' + submission.kind) {
      throw issueError(issue, 'kind label does not match the marked submission')
    }

    const features = getIssueFeatures(issue, submission, reviewState, waypointsById, issueRepository)
    const target = ACTIVE_REVIEW_LABELS.has(reviewState) ? toReview : approved
    target.features.push(...features)
  }

  return { toReview, approved }
}

