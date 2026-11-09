import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  buildReviewGeoJson,
  fetchOpenIssues,
  syncWaypointIssues,
} from './sync-waypoint-issues.mjs'

const START = '<!-- NUSGO_SUBMISSION_JSON_V1_START -->'
const END = '<!-- NUSGO_SUBMISSION_JSON_V1_END -->'
const fence = String.fromCharCode(96).repeat(3)

function bodyFor(submission) {
  return [
    START,
    fence + 'json',
    JSON.stringify({ schemaVersion: 1, submission }, null, 2),
    fence,
    END,
  ].join('\n')
}

function issue(number, kind, reviewState, submission, additionalLabels = []) {
  return {
    number,
    state: 'open',
    body: bodyFor(submission),
    labels: [
      { name: 'kind:' + kind },
      { name: reviewState },
      ...additionalLabels.map((name) => ({ name })),
    ],
  }
}

const currentWaypoint = {
  id: 'cw-123e4567-e89b-42d3-a456-426614174000',
  name: 'Water cooler',
  category: 'water_cooler',
  coordinate: { longitude: 103.78, latitude: 1.29 },
  source: 'Checked at the site',
  updatedAt: '2026-11-08',
}

const publicWaypoints = [currentWaypoint]

describe('buildReviewGeoJson', () => {
  it('puts new reports in the review layer without copying private text', () => {
    const result = buildReviewGeoJson([
      issue(12, 'new-place', 'review:new', {
        kind: 'new-place',
        category: 'atm',
        longitude: 103.781,
        latitude: 1.291,
        explanation: 'Private reporter explanation',
      }),
    ], publicWaypoints, 'owner/repo')

    assert.equal(result.toReview.features.length, 1)
    assert.equal(result.approved.features.length, 0)
    assert.deepEqual(result.toReview.features[0].geometry.coordinates, [103.781, 1.291])
    assert.deepEqual(result.toReview.features[0].properties, {
      issueNumber: 12,
      issueUrl: 'https://github.com/owner/repo/issues/12',
      kind: 'new-place',
      reviewState: 'new',
      reviewRole: 'proposed',
      category: 'atm',
    })
    assert.equal(JSON.stringify(result).includes('Private reporter explanation'), false)
  })

  it('moves an approved report into the approved layer', () => {
    const result = buildReviewGeoJson([
      issue(4, 'new-place', 'review:approved', {
        kind: 'new-place',
        category: 'toilet',
        longitude: 103.782,
        latitude: 1.292,
      }),
    ], publicWaypoints)

    assert.equal(result.toReview.features.length, 0)
    assert.equal(result.approved.features.length, 1)
    assert.equal(result.approved.features[0].properties.reviewState, 'approved')
  })

  it('shows current and proposed points for a moved correction', () => {
    const result = buildReviewGeoJson([
      issue(8, 'correction', 'review:reviewing', {
        kind: 'correction',
        waypointId: currentWaypoint.id,
        requestedChange: 'Move it to the other side of the lobby.',
        longitude: 103.781,
        latitude: 1.291,
      }),
    ], publicWaypoints)

    assert.deepEqual(result.toReview.features.map(({ properties, geometry }) => ({
      role: properties.reviewRole,
      coordinates: geometry.coordinates,
    })), [
      { role: 'current', coordinates: [103.78, 1.29] },
      { role: 'proposed', coordinates: [103.781, 1.291] },
    ])
  })

  it('shows the current point for text-only corrections and removals', () => {
    const result = buildReviewGeoJson([
      issue(8, 'correction', 'review:needs-check', {
        kind: 'correction',
        waypointId: currentWaypoint.id,
        requestedChange: 'The building name is incorrect.',
        name: 'Updated name',
      }),
      issue(9, 'removal', 'review:needs-check', {
        kind: 'removal',
        waypointId: currentWaypoint.id,
        reason: 'The facility was removed.',
      }),
    ], publicWaypoints)

    assert.deepEqual(result.toReview.features.map(({ properties }) => [
      properties.issueNumber,
      properties.reviewRole,
      properties.targetWaypointId,
    ]), [
      [8, 'current', currentWaypoint.id],
      [9, 'current', currentWaypoint.id],
    ])
  })

  it('excludes final outcomes and ignores closed issues and pull requests', () => {
    const result = buildReviewGeoJson([
      issue(1, 'new-place', 'review:rejected', {
        kind: 'new-place',
        category: 'atm',
        longitude: 103.781,
        latitude: 1.291,
      }),
      issue(2, 'new-place', 'review:duplicate', {
        kind: 'new-place',
        category: 'atm',
        longitude: 103.781,
        latitude: 1.291,
      }),
      issue(3, 'new-place', 'review:outdated', {
        kind: 'new-place',
        category: 'atm',
        longitude: 103.781,
        latitude: 1.291,
      }),
      { ...issue(4, 'new-place', 'review:new', {}), state: 'closed' },
      { ...issue(5, 'new-place', 'review:new', {}), pull_request: { url: 'https://example.test/pr/5' } },
    ], publicWaypoints)

    assert.equal(result.toReview.features.length, 0)
    assert.equal(result.approved.features.length, 0)
  })

  it('rejects malformed issue states instead of treating them as an empty review queue', () => {
    const malformed = issue(6, 'new-place', 'review:new', {
      kind: 'new-place',
      category: 'atm',
      longitude: 103.781,
      latitude: 1.291,
    })
    delete malformed.state

    assert.throws(() => buildReviewGeoJson([malformed], publicWaypoints), /Issue #6: state must be open or closed/)
  })
  it('fails closed for missing or ambiguous review labels', () => {
    const missing = issue(6, 'new-place', 'review:new', {
      kind: 'new-place',
      category: 'atm',
      longitude: 103.781,
      latitude: 1.291,
    }).labels.filter(({ name }) => !name.startsWith('review:'))
    assert.throws(
      () => buildReviewGeoJson([{ ...issue(6, 'new-place', 'review:new', {}), labels: missing }], publicWaypoints),
      /Issue #6: must have exactly one supported review label/,
    )

    const ambiguous = issue(7, 'new-place', 'review:new', {
      kind: 'new-place',
      category: 'atm',
      longitude: 103.781,
      latitude: 1.291,
    })
    ambiguous.labels.push({ name: 'review:approved' })
    assert.throws(
      () => buildReviewGeoJson([ambiguous], publicWaypoints),
      /Issue #7: must have exactly one supported review label/,
    )
  })

  it('rejects malformed marked JSON and correction targets missing from public data', () => {
    const malformed = issue(10, 'new-place', 'review:new', {})
    malformed.body = START + '\n' + fence + 'json\n{"schemaVersion":1}\n' + fence + '\n' + END
    assert.throws(() => buildReviewGeoJson([malformed], publicWaypoints), /Issue #10: uses an unsupported submission schema/)

    const missingTarget = issue(11, 'removal', 'review:new', {
      kind: 'removal',
      waypointId: 'cw-223e4567-e89b-42d3-a456-426614174000',
      reason: 'The facility was removed.',
    })
    assert.throws(
      () => buildReviewGeoJson([missingTarget], publicWaypoints),
      /Issue #11: targets a Community Waypoint that is not in the public dataset/,
    )
  })
})

describe('fetchOpenIssues', () => {
  it('rejects repository names that could alter the GitHub API path', async () => {
    for (const repository of ['owner/repo?state=all', '../repo', 'owner/repo\n']) {
      await assert.rejects(
        fetchOpenIssues('test-token', repository, async () => { throw new Error('must not fetch') }),
        /A valid issue repository is required/,
      )
    }
  })
  it('fetches all pages and skips pull requests', async () => {
    const calls = []
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ number: index + 1, state: 'open' }))
    firstPage[0] = { number: 1, state: 'open', pull_request: { url: 'https://example.test/pr/1' } }
    const fetcher = async (url, options) => {
      calls.push({ url: new URL(url), options })
      const page = new URL(url).searchParams.get('page')
      return {
        ok: true,
        json: async () => page === '1' ? firstPage : [{ number: 101, state: 'open' }],
      }
    }

    const issues = await fetchOpenIssues('test-token', 'owner/repo', fetcher)

    assert.equal(calls.length, 2)
    assert.equal(calls[0].url.searchParams.get('per_page'), '100')
    assert.equal(calls[1].url.searchParams.get('page'), '2')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token')
    assert.equal(issues.length, 100)
    assert.equal(issues.some(({ pull_request }) => pull_request), false)
    await assert.rejects(fetchOpenIssues('test-token', 'owner/repo', async () => ({
      ok: true,
      json: async () => [{ number: 102, state: 'open', pull_request: 'malformed' }],
    })), /Issue #102: pull_request must be an object when present/)
  })
})

describe('syncWaypointIssues', () => {
  it('writes both snapshots and preserves them when the issue fetch fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nusgo-waypoint-review-'))
    const publicDataFile = join(directory, 'public.geojson')
    const outputDirectory = join(directory, 'generated')
    await writeFile(publicDataFile, JSON.stringify({ type: 'FeatureCollection', features: [] }), 'utf8')
    const submission = {
      kind: 'new-place',
      category: 'atm',
      longitude: 103.781,
      latitude: 1.291,
    }
    const fetcher = async () => ({
      ok: true,
      json: async () => [issue(15, 'new-place', 'review:approved', submission)],
    })

    try {
      const first = await syncWaypointIssues({
        token: 'test-token',
        repository: 'owner/repo',
        publicDataFile,
        outputDirectory,
        fetcher,
      })
      assert.equal(first.approvedFeatureCount, 1)

      const approvedPath = join(outputDirectory, 'approved.geojson')
      const beforeFailure = await readFile(approvedPath, 'utf8')
      await assert.rejects(syncWaypointIssues({
        token: 'test-token',
        repository: 'owner/repo',
        publicDataFile,
        outputDirectory,
        fetcher: async () => ({ ok: false, status: 503 }),
      }), /GitHub issue fetch failed with status 503/)
      assert.equal(await readFile(approvedPath, 'utf8'), beforeFailure)
      await assert.rejects(syncWaypointIssues({
        token: 'test-token',
        repository: 'owner/repo',
        publicDataFile,
        outputDirectory,
        fetcher: async () => ({
          ok: true,
          json: async () => [{ ...issue(15, 'new-place', 'review:approved', submission), state: null }],
        }),
      }), /Issue #15: state must be open or closed/)
      assert.equal(await readFile(approvedPath, 'utf8'), beforeFailure)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})