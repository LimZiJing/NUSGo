import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseCommunityWaypointSubmission } from '../shared/src/waypoints/community-submission-validation.ts'
import { parseCommunityWaypointsGeoJson } from '../shared/src/waypoints/community-geojson.ts'

const API_VERSION = '2022-11-28'
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

export async function fetchOpenIssues(token, repository, fetcher = fetch) {
  const credential = token?.trim()
  if (!credential) throw new Error('A GitHub token is required')
  if (!isValidIssueRepository(repository)) {
    throw new Error('A valid issue repository is required')
  }

  const allIssues = []
  for (let page = 1; ; page += 1) {
    const url = new URL('https://api.github.com/repos/' + repository + '/issues')
    url.searchParams.set('state', 'open')
    url.searchParams.set('per_page', String(PAGE_SIZE))
    url.searchParams.set('page', String(page))
    const response = await fetcher(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + credential,
        'X-GitHub-Api-Version': API_VERSION,
      },
    })
    if (!response.ok) throw new Error('GitHub issue fetch failed with status ' + response.status)

    const payload = await response.json()
    if (!Array.isArray(payload)) throw new Error('GitHub issue response must be an array')
    allIssues.push(...payload)
    if (payload.length < PAGE_SIZE) break
  }

  return allIssues.filter((issue) => {
    if (!isRecord(issue)) throw new Error('GitHub issue response must contain issue objects')
    assertIssueState(issue)
    return !isPullRequest(issue)
  })
}

async function readPublicWaypoints(filePath) {
  const input = JSON.parse(await readFile(filePath, 'utf8'))
  return parseCommunityWaypointsGeoJson(input)
}

async function readExistingFile(filePath) {
  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function replaceFileIfChanged(filePath, content) {
  if (await readExistingFile(filePath) === content) return false
  const temporaryPath = filePath + '.' + process.pid + '.tmp'
  try {
    await writeFile(temporaryPath, content, 'utf8')
    await rename(temporaryPath, filePath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => {})
    throw error
  }
  return true
}

async function writeReviewGeoJson(outputDirectory, layers) {
  await mkdir(outputDirectory, { recursive: true })
  const files = [
    ['to-review.geojson', layers.toReview],
    ['approved.geojson', layers.approved],
  ]
  const changed = []
  for (const [name, collection] of files) {
    const filePath = resolve(outputDirectory, name)
    const content = JSON.stringify(collection, null, 2) + '\n'
    if (await replaceFileIfChanged(filePath, content)) changed.push(filePath)
  }
  return changed
}

export async function syncWaypointIssues({
  token,
  repository,
  publicDataFile,
  outputDirectory,
  fetcher = fetch,
}) {
  const [issues, publicWaypoints] = await Promise.all([
    fetchOpenIssues(token, repository, fetcher),
    readPublicWaypoints(publicDataFile),
  ])
  const layers = buildReviewGeoJson(issues, publicWaypoints, repository)
  const changedFiles = await writeReviewGeoJson(outputDirectory, layers)
  return {
    issueCount: issues.length,
    toReviewFeatureCount: layers.toReview.features.length,
    approvedFeatureCount: layers.approved.features.length,
    changedFiles,
  }
}

function readFlag(args, name) {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(name + ' needs a value')
  return value
}

async function main() {
  const args = process.argv.slice(2)
  const publicDataFile = readFlag(args, '--public-data-file')
  const outputDirectory = readFlag(args, '--output-dir')
  if (!publicDataFile) throw new Error('Pass --public-data-file with the current public GeoJSON')
  if (!outputDirectory) throw new Error('Pass --output-dir inside the private submissions repository')
  const result = await syncWaypointIssues({
    token: process.env.GITHUB_TOKEN,
    repository: process.env.COMMUNITY_WAYPOINT_ISSUES_REPOSITORY ?? ISSUE_REPOSITORY_DEFAULT,
    publicDataFile: resolve(publicDataFile),
    outputDirectory: resolve(outputDirectory),
  })
  console.log(
    'Synced ' + result.issueCount + ' open issues: ' +
    result.toReviewFeatureCount + ' to-review features and ' +
    result.approvedFeatureCount + ' approved features.',
  )
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Waypoint issue sync failed')
    process.exitCode = 1
  })
}